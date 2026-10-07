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

import { useState, useEffect } from 'react';
import { Agent, ReasoningEngine, Config, Authorization, CloudRunService } from '../types';
import * as api from '../services/apiService';
import { AgentFormData, AgentType, getCompatibleReasoningEngineLocation } from '../components/agents/form/types';
import { toErrorMessage } from '../utils/errors';

export function useAgentForm(
  config: Config,
  agentToEdit: Agent | null | undefined,
  onSuccess: () => void
) {
  const [formData, setFormData] = useState<AgentFormData>({
    displayName: '',
    description: '',
    iconUri: '',
    agentId: '',
    createdBy: '',
    additionalInfo: '',
    reasoningEngineLocation: 'us-central1',
    reasoningEngineId: '',
    authIds: [''],
    starterPrompts: [''],
    a2aUrl: '',
    a2aOrg: 'My Organization',
  });

  const [agentType, setAgentType] = useState<AgentType>('reasoning_engine');
  const [a2aStreaming, setA2aStreaming] = useState(true);
  const [a2aExtensions, setA2aExtensions] = useState<Record<string, unknown>[]>([]);

  // Cloud Run Picker State
  const [cloudRunRegion, setCloudRunRegion] = useState('us-central1');
  const [cloudRunServices, setCloudRunServices] = useState<CloudRunService[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [useCloudRunPicker, setUseCloudRunPicker] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iconPreviewError, setIconPreviewError] = useState(false);

  const [rewritingField, setRewritingField] = useState<string | null>(null);
  const [rewriteError, setRewriteError] = useState<string | null>(null);

  const [reasoningEngines, setReasoningEngines] = useState<ReasoningEngine[]>([]);
  const [isLoadingEngines, setIsLoadingEngines] = useState(false);
  const [engineLoadError, setEngineLoadError] = useState<string | null>(null);

  const [authorizations, setAuthorizations] = useState<Authorization[]>([]);
  const [isLoadingAuths, setIsLoadingAuths] = useState(false);
  const [authLoadError, setAuthLoadError] = useState<string | null>(null);
  const [authInputMode, setAuthInputMode] = useState<'manual' | 'select'>('manual');

  // State for cURL command preview
  const [curlCommand, setCurlCommand] = useState('');
  const [copySuccessCurl, setCopySuccessCurl] = useState(false);

  const [isCrossProject, setIsCrossProject] = useState(false);
  const [sourceProjectId, setSourceProjectId] = useState('');
  const [fullEditingAgent, setFullEditingAgent] = useState<Agent | null>(agentToEdit || null);

  const isEditingDisabled = Boolean(
    agentToEdit && api.isGoogleManagedAgent(agentToEdit)
  );

  useEffect(() => {
    const compatibleLocation = getCompatibleReasoningEngineLocation(config.appLocation);
    setFormData(prev => ({ ...prev, reasoningEngineLocation: compatibleLocation }));
  }, [config.appLocation]);

  useEffect(() => {
    if (agentToEdit) {
      setFullEditingAgent(agentToEdit);
      let type: AgentType = 'reasoning_engine';
      let a2aUrl = '';
      let a2aOrg = '';

      if (agentToEdit.a2aAgentDefinition) {
        type = 'a2a';
        try {
          const card = JSON.parse(agentToEdit.a2aAgentDefinition.jsonAgentCard);
          a2aUrl = card.url || '';
          a2aOrg = card.provider?.organization || '';
          if (card.capabilities) {
            setA2aStreaming(card.capabilities.streaming !== false);
            setA2aExtensions(card.capabilities.extensions || []);
          } else {
            setA2aStreaming(true);
            setA2aExtensions([]);
          }
        } catch (e) {
          console.warn('Failed to parse A2A agent card JSON', e);
        }
      } else if (agentToEdit.adkAgentDefinition) {
        type = 'reasoning_engine';
        setA2aStreaming(true);
        setA2aExtensions([]);
      } else {
        type = 'no_code';
        setA2aStreaming(true);
        setA2aExtensions([]);
      }

      setAgentType(type);

      const rePath = agentToEdit.adkAgentDefinition?.provisionedReasoningEngine?.reasoningEngine || '';
      const reParts = rePath.split('/');
      const reProject = reParts.length > 1 ? reParts[1] : '';
      const isCross = reProject && reProject !== config.projectId;
      setIsCrossProject(Boolean(isCross));
      setSourceProjectId(reProject || config.projectId || '');

      const desc = agentToEdit.adkAgentDefinition?.toolSettings?.toolDescription || '';
      const createdByMatch = desc.match(/Created By: (.*)/);
      const infoMatch = desc.match(/Additional Info: ([\s\S]*)/);

      const createdBy = createdByMatch ? createdByMatch[1].trim() : '';
      let additionalInfo = '';

      if (createdByMatch || infoMatch) {
        additionalInfo = infoMatch ? infoMatch[1].trim() : '';
      } else {
        additionalInfo = desc;
      }

      setFormData({
        displayName: agentToEdit.displayName || '',
        description: agentToEdit.description || '',
        agentId: '',
        iconUri: agentToEdit.icon?.uri || '',
        createdBy,
        additionalInfo,
        reasoningEngineLocation: reParts.length > 3 ? reParts[3] : getCompatibleReasoningEngineLocation(config.appLocation),
        reasoningEngineId: reParts.length > 5 ? reParts[5] : '',
        authIds: (agentToEdit.authorizationConfig?.toolAuthorizations || agentToEdit.authorizations || [])
          .map(a => a.split('/').pop() || '')
          .filter(id => id) || [''],
        starterPrompts: agentToEdit.starterPrompts && agentToEdit.starterPrompts.length > 0
          ? agentToEdit.starterPrompts.map(p => p.text)
          : [''],
        a2aUrl,
        a2aOrg,
      });

      if (type === 'no_code' && typeof api.getAgent === 'function') {
        api.getAgent(agentToEdit.name, config)
          .then((fetched) => {
            if (!fetched) return;
            setFullEditingAgent(fetched);
            if (
              (!agentToEdit.starterPrompts || agentToEdit.starterPrompts.length === 0) &&
              fetched.starterPrompts &&
              fetched.starterPrompts.length > 0
            ) {
              setFormData(prev => ({
                ...prev,
                starterPrompts: fetched.starterPrompts!.map(p => p.text),
              }));
            }
          })
          .catch((err) => {
            console.warn('Could not fetch full no-code agent definition in useAgentForm:', err);
          });
      }
    }
  }, [agentToEdit, config]);

  useEffect(() => {
    if (!agentToEdit) {
      setSourceProjectId(config.projectId || '');
    }
  }, [config.projectId, agentToEdit]);

  useEffect(() => {
    const { projectId, appLocation, collectionId, appId, assistantId } = config;

    if (!projectId || !appLocation) {
      setCurlCommand('Project ID and Location must be set.');
      return;
    }

    const finalStarterPrompts = formData.starterPrompts
      .map(text => text.trim())
      .filter(text => text)
      .map(text => ({ text }));

    const validAuthIds = (formData.authIds || [])
      .map(id => id.split('/').pop()?.trim() || '')
      .filter(id => id.length > 0);

    const resolvedToolAuthorizations = validAuthIds.map(id => {
      const matched = authorizations.find(a => a.name === id || a.name.endsWith(`/${id}`));
      return matched ? matched.name : `projects/${projectId}/locations/global/authorizations/${id}`;
    });

    let agentDefinitionPayload: Partial<Agent> = {};

    if (agentType === 'reasoning_engine') {
      const reProject = isCrossProject && sourceProjectId ? sourceProjectId : projectId;
      const reasoningEnginePath = `projects/${reProject}/locations/${formData.reasoningEngineLocation}/reasoningEngines/${formData.reasoningEngineId}`;
      const newToolDescription = `[Agent Metadata]
Created By: ${formData.createdBy || 'N/A'}
Agent Engine: ${reasoningEnginePath}
Additional Info: ${formData.additionalInfo || 'None'}`;
      agentDefinitionPayload = {
        adkAgentDefinition: {
          toolSettings: { toolDescription: newToolDescription },
          provisionedReasoningEngine: { reasoningEngine: reasoningEnginePath },
        },
      };
    } else if (agentType === 'a2a') {
      const a2aUrl = formData.a2aUrl || '';
      let existingCard: Record<string, unknown> = {};
      if (agentToEdit?.a2aAgentDefinition?.jsonAgentCard) {
        try {
          existingCard = JSON.parse(agentToEdit.a2aAgentDefinition.jsonAgentCard) || {};
        } catch {
          existingCard = {};
        }
      }
      const existingProvider = (existingCard.provider as Record<string, unknown> | undefined) || {};
      const existingCapabilities = (existingCard.capabilities as Record<string, unknown> | undefined) || {};
      const cardObject = {
        protocolVersion: '0.3.0',
        defaultInputModes: ['text/plain'],
        defaultOutputModes: ['text/plain'],
        skills: [{ description: 'Chat', examples: ['Hello'], id: 'chat', name: 'Chat', tags: ['chat'] }],
        version: '1.0.0',
        ...existingCard,
        url: a2aUrl,
        provider: {
          ...existingProvider,
          organization: formData.a2aOrg,
          url: (existingProvider.url as string | undefined) || formData.a2aUrl,
        },
        name: formData.displayName,
        description: formData.description,
        capabilities: {
          ...existingCapabilities,
          streaming: a2aStreaming,
          ...(a2aExtensions.length > 0 ? { extensions: a2aExtensions } : {}),
        },
      };
      agentDefinitionPayload = {
        a2aAgentDefinition: {
          jsonAgentCard: JSON.stringify(cardObject),
        },
      };
    }

    if (agentToEdit) {
      const updateMask: string[] = [];
      const payload: Partial<Agent> = {};

      if (agentToEdit.displayName !== formData.displayName) {
        updateMask.push('display_name');
        payload.displayName = formData.displayName;
      }

      if (agentToEdit.description !== formData.description) {
        updateMask.push('description');
        payload.description = formData.description;
      }

      if ((agentToEdit.icon?.uri || '') !== formData.iconUri) {
        updateMask.push('icon');
        payload.icon = { uri: formData.iconUri };
      }

      const originalPrompts = (agentToEdit.starterPrompts || []).map(p => ({ text: p.text }));
      if (JSON.stringify(originalPrompts) !== JSON.stringify(finalStarterPrompts)) {
        updateMask.push('starter_prompts');
        payload.starterPrompts = finalStarterPrompts;
      }

      if (agentType !== 'no_code') {
        const originalAuthIds = (agentToEdit.authorizationConfig?.toolAuthorizations || agentToEdit.authorizations || [])
          .map(a => a.split('/').pop() || '')
          .filter(Boolean);
        if (JSON.stringify(originalAuthIds) !== JSON.stringify(validAuthIds)) {
          updateMask.push('authorization_config');
          payload.authorizationConfig = {
            toolAuthorizations: resolvedToolAuthorizations,
          };
        }
      }

      if (agentType === 'reasoning_engine') {
        updateMask.push('adk_agent_definition');
        payload.adkAgentDefinition = agentDefinitionPayload.adkAgentDefinition;
      } else if (agentType === 'a2a') {
        updateMask.push('a2a_agent_definition');
        payload.a2aAgentDefinition = agentDefinitionPayload.a2aAgentDefinition;
      } else if (
        agentType === 'no_code' &&
        (fullEditingAgent?.lowCodeAgentDefinition || agentToEdit.lowCodeAgentDefinition) &&
        (agentToEdit.displayName !== formData.displayName ||
          agentToEdit.description !== formData.description ||
          (agentToEdit.icon?.uri || '') !== formData.iconUri)
      ) {
        updateMask.push('low_code_agent_definition');
        payload.lowCodeAgentDefinition = {
          ...(fullEditingAgent?.lowCodeAgentDefinition || agentToEdit.lowCodeAgentDefinition),
          draftDisplayName: formData.displayName,
          draftDescription: formData.description,
          ...(formData.iconUri ? { draftIcon: { uri: formData.iconUri } } : {}),
        };
      }

      if (updateMask.length === 0) {
        setCurlCommand('# No changes detected. Modify the form to see the update command.');
        return;
      }

      const payloadString = JSON.stringify(payload, null, 2);
      const url = `https://${appLocation === 'global' ? '' : appLocation + '-'}discoveryengine.googleapis.com/v1alpha/${agentToEdit.name}?updateMask=${updateMask.join(',')}`;

      const command = `curl -X PATCH \\
     -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
     -H "Content-Type: application/json" \\
     -H "X-Goog-User-Project: ${projectId}" \\
     -d '${payloadString}' \\
     "${url}"`;

      setCurlCommand(command);
    } else {
      if (!collectionId || !appId || !assistantId) {
        setCurlCommand('Fill out the main configuration on the Agents page to generate the command.');
        return;
      }

      const createPayload: Partial<Agent> = {
        displayName: formData.displayName,
        description: formData.description,
        icon: formData.iconUri ? { uri: formData.iconUri } : undefined,
        starterPrompts: finalStarterPrompts.length > 0 ? finalStarterPrompts : undefined,
        ...agentDefinitionPayload,
      };

      if (resolvedToolAuthorizations.length > 0) {
        createPayload.authorizationConfig = {
          toolAuthorizations: resolvedToolAuthorizations,
        };
      }

      const payloadString = JSON.stringify(createPayload, null, 2);
      const parent = `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants/${assistantId}`;
      let url = `https://${appLocation === 'global' ? '' : appLocation + '-'}discoveryengine.googleapis.com/v1alpha/${parent}/agents`;
      if (formData.agentId.trim()) {
        url += `?agent_id=${formData.agentId.trim()}`;
      }

      const command = `curl -X POST \\
     -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
     -H "Content-Type: application/json" \\
     -H "X-Goog-User-Project: ${projectId}" \\
     -d '${payloadString}' \\
     "${url}"`;

      setCurlCommand(command);
    }
  }, [formData, agentToEdit, config, agentType, isCrossProject, sourceProjectId, a2aStreaming, a2aExtensions, authorizations]);

  useEffect(() => {
    setIconPreviewError(false);
  }, [formData.iconUri]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleStarterPromptChange = (index: number, value: string) => {
    const newPrompts = [...formData.starterPrompts];
    newPrompts[index] = value;
    setFormData({ ...formData, starterPrompts: newPrompts });
  };

  const addStarterPrompt = () => {
    setFormData({ ...formData, starterPrompts: [...formData.starterPrompts, ''] });
  };

  const removeStarterPrompt = (index: number) => {
    if (formData.starterPrompts.length <= 1) {
      setFormData({ ...formData, starterPrompts: [''] });
      return;
    }
    const newPrompts = formData.starterPrompts.filter((_, i) => i !== index);
    setFormData({ ...formData, starterPrompts: newPrompts });
  };

  const handleAuthIdChange = (index: number, value: string) => {
    const newAuthIds = [...formData.authIds];
    newAuthIds[index] = value;
    setFormData({ ...formData, authIds: newAuthIds });
  };

  const addAuthId = () => {
    setFormData({ ...formData, authIds: [...formData.authIds, ''] });
  };

  const removeAuthId = (index: number) => {
    const newAuthIds = formData.authIds.filter((_, i) => i !== index);
    setFormData({ ...formData, authIds: newAuthIds.length ? newAuthIds : [''] });
  };

  const handleLoadEngines = async () => {
    if (!formData.reasoningEngineLocation) {
      setEngineLoadError('Please enter a location to load agent engines from.');
      return;
    }
    setIsLoadingEngines(true);
    setEngineLoadError(null);
    setReasoningEngines([]);
    try {
      const activeProject = isCrossProject && sourceProjectId ? sourceProjectId : config.projectId;
      const engineConfig = { ...config, projectId: activeProject, reasoningEngineLocation: formData.reasoningEngineLocation };
      const response = await api.listReasoningEngines(engineConfig);
      setReasoningEngines(response.reasoningEngines || []);
      if (!response.reasoningEngines || response.reasoningEngines.length === 0) {
        setEngineLoadError(`No agent engines found in ${formData.reasoningEngineLocation}.`);
      }
    } catch (err: unknown) {
      setEngineLoadError(toErrorMessage(err) || 'Failed to load agent engines.');
    } finally {
      setIsLoadingEngines(false);
    }
  };

  const handleLoadAuthorizations = async () => {
    setIsLoadingAuths(true);
    setAuthLoadError(null);
    setAuthorizations([]);
    try {
      const response = await api.listAuthorizations(config);
      const auths = response.authorizations || [];
      setAuthorizations(auths);
      if (auths.length === 0) {
        setAuthLoadError('No authorizations found for this project.');
        setAuthInputMode('manual');
      } else {
        setAuthLoadError(null);
        setAuthInputMode('select');
      }
    } catch (err: unknown) {
      setAuthLoadError(toErrorMessage(err) || 'Failed to load authorizations.');
    } finally {
      setIsLoadingAuths(false);
    }
  };

  const handleEngineSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const engineName = e.target.value;
    const selectedEngine = reasoningEngines.find(engine => engine.name === engineName);
    if (selectedEngine) {
      const id = selectedEngine.name.split('/').pop();
      setFormData(prev => ({ ...prev, reasoningEngineId: id || '' }));
    }
  };

  const handleLoadServices = async () => {
    setIsLoadingServices(true);
    setError(null);
    try {
      const res = await api.listCloudRunServices(config, cloudRunRegion);
      setCloudRunServices(res.services || []);
    } catch (e: unknown) {
      console.error(e);
      setError(toErrorMessage(e) || `Failed to load Cloud Run services in ${cloudRunRegion}.`);
    } finally {
      setIsLoadingServices(false);
    }
  };

  const handleServiceSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const uri = e.target.value;
    if (uri) {
      setFormData(prev => ({
        ...prev,
        a2aUrl: `${uri.replace(/\/$/, '')}/invoke`,
      }));
    }
  };

  const handleRewrite = async (field: 'description') => {
    setRewritingField(field);
    setRewriteError(null);
    const currentValue = formData[field];
    if (!currentValue.trim()) {
      setRewriteError('Please enter some text to rewrite.');
      setRewritingField(null);
      return;
    }

    let prompt = '';
    if (field === 'description') {
      const toolDesc = agentType === 'reasoning_engine'
        ? `Agent Engine: ${formData.reasoningEngineId}, Created By: ${formData.createdBy}, Info: ${formData.additionalInfo}`
        : agentType === 'a2a'
          ? `A2A Service URL: ${formData.a2aUrl}, Organization: ${formData.a2aOrg}`
          : `No-Code / Low-Code / Workflow Agent: ${formData.displayName}`;

      prompt = `An agent has the following backend metadata: "${toolDesc}". 
Based on this capability, rewrite the agent's main description to clearly explain what the agent does for an end-user. The new description should be a single paragraph. Do not offer multiple options.

Original agent description: "${currentValue}"

Rewritten agent description:`;
    }

    try {
      const text = await api.generateVertexContent(config, prompt, 'gemini-2.5-flash');
      const rewrittenText = text.trim();
      const cleanedText = rewrittenText.replace(/^["']|["']$/g, '').replace(/^```\w*\n?|\n?```$/g, '').trim();
      setFormData(prev => ({ ...prev, [field]: cleanedText }));
    } catch (err: unknown) {
      setRewriteError(`AI rewrite failed: ${toErrorMessage(err)}`);
    } finally {
      setRewritingField(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditingDisabled) return;

    setIsSubmitting(true);
    setError(null);

    const finalStarterPrompts = formData.starterPrompts
      .map(text => text.trim())
      .filter(text => text)
      .map(text => ({ text }));

    let agentDefinitionPayload: Partial<Agent> = {};

    if (agentType === 'reasoning_engine') {
      const reProject = isCrossProject && sourceProjectId ? sourceProjectId : config.projectId;
      const reasoningEnginePath = `projects/${reProject}/locations/${formData.reasoningEngineLocation}/reasoningEngines/${formData.reasoningEngineId}`;
      const newToolDescription = `[Agent Metadata]
Created By: ${formData.createdBy || 'N/A'}
Agent Engine: ${reasoningEnginePath}
Additional Info: ${formData.additionalInfo || 'None'}`;
      agentDefinitionPayload = {
        adkAgentDefinition: {
          toolSettings: { toolDescription: newToolDescription },
          provisionedReasoningEngine: {
            reasoningEngine: reasoningEnginePath,
          },
        },
      };
    } else if (agentType === 'a2a') {
      if (!formData.a2aUrl) {
        setError('Agent URL is required for A2A agents.');
        setIsSubmitting(false);
        return;
      }

      const a2aUrl = formData.a2aUrl || '';
      let existingCard: Record<string, unknown> = {};
      if (agentToEdit?.a2aAgentDefinition?.jsonAgentCard) {
        try {
          existingCard = JSON.parse(agentToEdit.a2aAgentDefinition.jsonAgentCard) || {};
        } catch {
          existingCard = {};
        }
      }
      const existingProvider = (existingCard.provider as Record<string, unknown> | undefined) || {};
      const existingCapabilities = (existingCard.capabilities as Record<string, unknown> | undefined) || {};
      const cardObject = {
        protocolVersion: '0.3.0',
        defaultInputModes: ['text/plain'],
        defaultOutputModes: ['text/plain'],
        skills: [{ description: 'Chat', examples: ['Hello'], id: 'chat', name: 'Chat', tags: ['chat'] }],
        version: '1.0.0',
        ...existingCard,
        url: a2aUrl,
        provider: {
          ...existingProvider,
          organization: formData.a2aOrg,
          url: (existingProvider.url as string | undefined) || formData.a2aUrl,
        },
        name: formData.displayName,
        description: formData.description,
        capabilities: {
          ...existingCapabilities,
          streaming: a2aStreaming,
          ...(a2aExtensions.length > 0 ? { extensions: a2aExtensions } : {}),
        },
      };
      agentDefinitionPayload = {
        a2aAgentDefinition: {
          jsonAgentCard: JSON.stringify(cardObject),
        },
      };
    }

    const validAuthIds = formData.authIds
      .map(id => id.trim())
      .filter(id => id.length > 0);

    const resolvedToolAuthorizations = validAuthIds.map(id => {
      const matched = authorizations.find(a => a.name === id || a.name.endsWith(`/${id}`));
      return matched ? matched.name : (id.startsWith('projects/') ? id : `projects/${config.projectId}/locations/global/authorizations/${id}`);
    });

    try {
      if (agentToEdit) {
        const sourceAgent = fullEditingAgent || agentToEdit;
        const agentPayload: Partial<Agent> = {
          displayName: formData.displayName,
          description: formData.description,
          icon: { uri: formData.iconUri },
          starterPrompts: finalStarterPrompts,
          ...agentDefinitionPayload,
        };
        if (agentType === 'no_code') {
          if (sourceAgent.lowCodeAgentDefinition) {
            agentPayload.lowCodeAgentDefinition = {
              ...sourceAgent.lowCodeAgentDefinition,
              draftDisplayName: formData.displayName,
              draftDescription: formData.description,
              ...(formData.iconUri ? { draftIcon: { uri: formData.iconUri } } : {}),
            };
          }
        } else {
          const hadExistingAuth = (agentToEdit.authorizationConfig?.toolAuthorizations?.length ?? 0) > 0;
          if (resolvedToolAuthorizations.length > 0 || hadExistingAuth) {
            agentPayload.authorizationConfig = {
              toolAuthorizations: resolvedToolAuthorizations,
            };
          }
        }
        await api.updateAgent(sourceAgent, agentPayload, config);
      } else {
        const createPayload: Partial<Agent> = {
          displayName: formData.displayName,
          description: formData.description,
          icon: { uri: formData.iconUri },
          starterPrompts: finalStarterPrompts.length > 0 ? finalStarterPrompts : undefined,
          ...agentDefinitionPayload,
        };

        if (resolvedToolAuthorizations.length > 0) {
          createPayload.authorizationConfig = {
            toolAuthorizations: resolvedToolAuthorizations,
          };
        }

        const agentId = formData.agentId.trim() || undefined;
        await api.createAgent(createPayload, config, agentId);
      }
      onSuccess();
    } catch (err: unknown) {
      setError(toErrorMessage(err) || 'Failed to save agent.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyCurlCommand = () => {
    navigator.clipboard.writeText(curlCommand).then(() => {
      setCopySuccessCurl(true);
      setTimeout(() => setCopySuccessCurl(false), 2000);
    });
  };

  return {
    formData,
    handleChange,
    agentType,
    setAgentType,
    a2aStreaming,
    setA2aStreaming,
    a2aExtensions,
    setA2aExtensions,
    cloudRunRegion,
    setCloudRunRegion,
    cloudRunServices,
    isLoadingServices,
    useCloudRunPicker,
    setUseCloudRunPicker,
    isSubmitting,
    error,
    iconPreviewError,
    setIconPreviewError,
    rewritingField,
    rewriteError,
    reasoningEngines,
    isLoadingEngines,
    engineLoadError,
    authorizations,
    isLoadingAuths,
    authLoadError,
    authInputMode,
    setAuthInputMode,
    curlCommand,
    copySuccessCurl,
    isCrossProject,
    setIsCrossProject,
    sourceProjectId,
    setSourceProjectId,
    isEditingDisabled,
    handleStarterPromptChange,
    addStarterPrompt,
    removeStarterPrompt,
    handleAuthIdChange,
    addAuthId,
    removeAuthId,
    handleLoadEngines,
    handleEngineSelect,
    handleLoadAuthorizations,
    handleLoadServices,
    handleServiceSelect,
    handleRewrite,
    handleCopyCurlCommand,
    handleSubmit,
  };
}
