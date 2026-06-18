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


import React, { useState, useEffect } from 'react';
import { Agent, ReasoningEngine, Config, Authorization, CloudRunService } from '../../types';
import * as api from '../../services/apiService';

const getCompatibleReasoningEngineLocation = (appLocation: string): string => {
    switch (appLocation) {
        case 'us':
        case 'global':
            return 'us-central1';
        case 'eu':
            return 'europe-west1';
        default:
            return 'us-central1'; 
    }
};

interface AgentFormProps {
  config: Config;
  onSuccess: () => void;
  onCancel: () => void;
  agentToEdit?: Agent | null;
}

type AgentType = 'reasoning_engine' | 'a2a';

const AgentForm: React.FC<AgentFormProps> = ({ config, onSuccess, onCancel, agentToEdit }) => {
  const [formData, setFormData] = useState({
    displayName: 'My New Agent',
    description: 'An agent registered via the web UI.',
    agentId: '', // For specifying name on create
    iconUri: 'https://www.svgrepo.com/show/533810/chef-man-cap.svg',
    createdBy: '',
    additionalInfo: '',
    reasoningEngineLocation: 'us-central1',
    reasoningEngineId: '901164128171720704',
      authIds: [''],
    starterPrompts: [''],
    // A2A Specific
    a2aUrl: '',
    a2aOrg: 'My Organization',
  });
  const [agentType, setAgentType] = useState<AgentType>('reasoning_engine');
  const [a2aStreaming, setA2aStreaming] = useState(true);
  const [a2aExtensions, setA2aExtensions] = useState<any[]>([]);
  
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

  const isEditingDisabled = agentToEdit && !agentToEdit.state;

  useEffect(() => {
    // When the form loads or the config (appLocation) changes,
    // automatically set the compatible reasoning engine location.
    const compatibleLocation = getCompatibleReasoningEngineLocation(config.appLocation);
    setFormData(prev => ({ ...prev, reasoningEngineLocation: compatibleLocation }));
  }, [config.appLocation]);

  useEffect(() => {
    if (agentToEdit) {
      let type: AgentType = 'reasoning_engine';
      let a2aUrl = '';
      let a2aOrg = '';
      
      // Heuristic to detect agent type
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
              console.warn("Failed to parse A2A agent card JSON", e);
          }
      } else {
          setA2aStreaming(true);
          setA2aExtensions([]);
      }

      setAgentType(type);

      const rePath = agentToEdit.adkAgentDefinition?.provisionedReasoningEngine?.reasoningEngine || '';
      const reParts = rePath.split('/');
      const reProject = reParts.length > 1 ? reParts[1] : '';
      const isCross = reProject && reProject !== config.projectId;
      setIsCrossProject(!!isCross);
      setSourceProjectId(reProject || config.projectId || '');

      const desc = agentToEdit.adkAgentDefinition?.toolSettings?.toolDescription || '';
      const createdByMatch = desc.match(/Created By: (.*)/);
      const infoMatch = desc.match(/Additional Info: ([\s\S]*)/);

      const createdBy = createdByMatch ? createdByMatch[1].trim() : '';
      let additionalInfo = '';

      if (createdByMatch || infoMatch) {
          additionalInfo = infoMatch ? infoMatch[1].trim() : '';
      } else {
          // Not in the new format, so treat the whole thing as additional info
          additionalInfo = desc;
      }
      
      setFormData({
        displayName: agentToEdit.displayName || '',
        description: agentToEdit.description || '',
        agentId: '', // Not used for editing
        iconUri: agentToEdit.icon?.uri || '',
        createdBy: createdBy,
        additionalInfo: additionalInfo,
        reasoningEngineLocation: reParts.length > 3 ? reParts[3] : getCompatibleReasoningEngineLocation(config.appLocation),
        reasoningEngineId: reParts.length > 5 ? reParts[5] : '',
          authIds: (agentToEdit.authorizationConfig?.toolAuthorizations || agentToEdit.authorizations || [])
              .map(a => a.split('/').pop() || '')
              .filter(id => id) || [''],
        starterPrompts: agentToEdit.starterPrompts && agentToEdit.starterPrompts.length > 0
            ? agentToEdit.starterPrompts.map(p => p.text)
            : [''],
        a2aUrl: a2aUrl,
        a2aOrg: a2aOrg,
      });
    }
  }, [agentToEdit, config.appLocation]);

  useEffect(() => {
    if (!agentToEdit) {
      setSourceProjectId(config.projectId || '');
    }
  }, [config.projectId, agentToEdit]);


    // Effect to generate the cURL command preview for both create and update
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
        
        // Prepare payloads based on agent type
        let agentDefinitionPayload: any = {};
        
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
                    provisionedReasoningEngine: { reasoningEngine: reasoningEnginePath }
                }
            };
        } else {
            // A2A Construction
            const a2aUrl = formData.a2aUrl || '';
            const cardObject = {
                protocolVersion: "0.3.0",
                url: a2aUrl,
                provider: {
                    organization: formData.a2aOrg,
                    url: formData.a2aUrl,
                },
                name: formData.displayName,
                description: formData.description,
                capabilities: {
                    streaming: a2aStreaming,
                    ...(a2aExtensions.length > 0 ? { extensions: a2aExtensions } : {})
                },
                defaultInputModes: ["text/plain"],
                defaultOutputModes: ["text/plain"],
                skills: [{ description: "Chat", examples: ["Hello"], id: "chat", name: "Chat", tags: ["chat"] }],
                version: "1.0.0"
            };
            agentDefinitionPayload = {
                a2aAgentDefinition: {
                    jsonAgentCard: JSON.stringify(cardObject)
                }
            };
        }


        if (agentToEdit) {
            // --- UPDATE (PATCH) LOGIC ---
            const updateMask: string[] = [];
            const payload: any = {};

            if (agentToEdit.displayName !== formData.displayName) {
                updateMask.push('display_name');
                payload.displayName = formData.displayName;
            }

            if (agentToEdit.description !== formData.description) {
                updateMask.push('description');
                payload.description = formData.description;
            }
            
            if (agentToEdit.icon?.uri !== formData.iconUri) {
                updateMask.push('icon');
                payload.icon = { uri: formData.iconUri };
            }

            const originalPrompts = (agentToEdit.starterPrompts || []).map(p => ({ text: p.text }));
            if (JSON.stringify(originalPrompts) !== JSON.stringify(finalStarterPrompts)) {
                updateMask.push('starter_prompts');
                payload.starterPrompts = finalStarterPrompts;
            }
            
            // Only add definition update if relevant fields changed (simplified check)
            if (agentType === 'reasoning_engine') {
                 // Check if it's worth updating definition
                 updateMask.push('adk_agent_definition');
                payload.adkAgentDefinition = agentDefinitionPayload.adkAgentDefinition;
            } else {
                 updateMask.push('a2a_agent_definition');
                payload.a2aAgentDefinition = agentDefinitionPayload.a2aAgentDefinition;
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
            // --- CREATE (POST) LOGIC ---
            if (!collectionId || !appId || !assistantId) {
                setCurlCommand('Fill out the main configuration on the Agents page to generate the command.');
                return;
            }

            const createPayload: any = {
                displayName: formData.displayName,
                description: formData.description,
                icon: formData.iconUri ? { uri: formData.iconUri } : undefined,
                starterPrompts: finalStarterPrompts.length > 0 ? finalStarterPrompts : undefined,
                ...agentDefinitionPayload
            };
        
            const finalAuthId = (formData.authIds && formData.authIds.length > 0) ? formData.authIds[0].split('/').pop()?.trim() : undefined;
            if (finalAuthId) {
                const selectedAuth = authorizations.find(a => a.name.endsWith(`/${finalAuthId}`));
                const authResourceName = selectedAuth ? selectedAuth.name : `projects/${projectId}/locations/global/authorizations/${finalAuthId}`;

                createPayload.authorizationConfig = {
                    toolAuthorizations: [
                        authResourceName
                    ]
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
    }, [formData, agentToEdit, config, agentType, isCrossProject, sourceProjectId, a2aStreaming, a2aExtensions]);


  useEffect(() => {
    setIconPreviewError(false);
  }, [formData.iconUri]);
  
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
            : `A2A Service URL: ${formData.a2aUrl}, Organization: ${formData.a2aOrg}`;
            
        prompt = `An agent has the following backend metadata: "${toolDesc}". 
Based on this capability, rewrite the agent's main description to clearly explain what the agent does for an end-user. The new description should be a single paragraph. Do not offer multiple options.

Original agent description: "${currentValue}"

Rewritten agent description:`;
    }

    try {
        const text = await api.generateVertexContent(config, prompt, 'gemini-2.5-flash');
        const rewrittenText = text.trim();
        // Clean up if the model returns markdown or quotes
        const cleanedText = rewrittenText.replace(/^["']|["']$/g, '').replace(/^```\w*\n?|\n?```$/g, '').trim();
        setFormData(prev => ({ ...prev, [field]: cleanedText }));
    } catch (err: any) {
        setRewriteError(`AI rewrite failed: ${err.message}`);
    } finally {
        setRewritingField(null);
    }
  };

  const AiRewriteButton: React.FC<{ field: 'description' }> = ({ field }) => {
        const isRewriting = rewritingField === field;
        return (
            <button
                type="button"
                onClick={() => handleRewrite(field)}
                disabled={isRewriting || isEditingDisabled}
                className="p-1.5 text-gray-400 bg-gray-700 hover:bg-indigo-600 hover:text-white rounded-md transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
                title={`Rewrite description with AI`}
            >
                {isRewriting ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                        <path d="M12.736 3.97a6 6 0 014.243 4.243l2.022-2.022a1 1 0 10-1.414-1.414L15.56 6.8A6.002 6.002 0 0112.736 3.97zM3.97 12.736a6 6 0 01-1.243-5.222L4.75 9.536a1 1 0 001.414-1.414L4.142 6.1A6.002 6.002 0 013.97 12.736z" />
                    </svg>
                )}
            </button>
        );
    };

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
    if (formData.starterPrompts.length <= 1) { // Always keep at least one input
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
        setEngineLoadError("Please enter a location to load agent engines from.");
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
    } catch (err: any) {
        setEngineLoadError(err.message || "Failed to load agent engines.");
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
            setAuthLoadError("No authorizations found for this project.");
            setAuthInputMode('manual'); // Stay in manual mode if none found
        } else {
            setAuthLoadError(null); // Clear previous error on success
            setAuthInputMode('select'); // Switch to select mode on success
        }
    } catch (err: any) {
        setAuthLoadError(err.message || "Failed to load authorizations.");
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
      try {
          const res = await api.listCloudRunServices({ projectId: config.projectId } as any, cloudRunRegion);
          setCloudRunServices(res.services || []);
      } catch (e) {
          console.error(e);
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
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditingDisabled) return;
    
    setIsSubmitting(true);
    setError(null);

    const finalStarterPrompts = formData.starterPrompts
        .map(text => text.trim())
        .filter(text => text)
        .map(text => ({ text }));
        
    let agentDefinitionPayload: any = {};
    
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
    } else {
        // A2A
        if (!formData.a2aUrl) {
            setError("Agent URL is required for A2A agents.");
            setIsSubmitting(false);
            return;
        }
        
        const a2aUrl = formData.a2aUrl || '';
        const cardObject = {
            protocolVersion: "0.3.0",
            url: a2aUrl,
            provider: {
                organization: formData.a2aOrg,
                url: formData.a2aUrl,
            },
            name: formData.displayName,
            description: formData.description,
            capabilities: {
                streaming: a2aStreaming,
                ...(a2aExtensions.length > 0 ? { extensions: a2aExtensions } : {})
            },
            defaultInputModes: ["text/plain"],
            defaultOutputModes: ["text/plain"],
            skills: [{ description: "Chat", examples: ["Hello"], id: "chat", name: "Chat", tags: ["chat"] }],
            version: "1.0.0"
        };
        agentDefinitionPayload = {
            a2aAgentDefinition: {
                jsonAgentCard: JSON.stringify(cardObject)
            }
        };
    }

    try {
      if (agentToEdit) {
        // Build the payload for the update using the camelCase Agent type
        const agentPayload: Partial<Agent> = {
            displayName: formData.displayName,
            description: formData.description,
            icon: { uri: formData.iconUri },
            starterPrompts: finalStarterPrompts,
            ...agentDefinitionPayload
        };
        await api.updateAgent(agentToEdit, agentPayload, config);
      } else {
        const createPayload: any = {
            displayName: formData.displayName,
            description: formData.description,
            icon: { uri: formData.iconUri },
            starterPrompts: finalStarterPrompts.length > 0 ? finalStarterPrompts : undefined,
            ...agentDefinitionPayload
        };
    
          const validAuthIds = formData.authIds
              .map(id => id.trim())
              .filter(id => id.length > 0);

          if (validAuthIds.length > 0) {
              // Map IDs back to matching full resource names if found in authorizations list
              const toolAuthorizations = validAuthIds.map(id => {
                  // Try exact match or suffix match
                  const matched = authorizations.find(a => a.name === id || a.name.endsWith(`/${id}`));
                  return matched ? matched.name : `projects/${config.projectId}/locations/global/authorizations/${id}`;
              });

            createPayload.authorizationConfig = {
                toolAuthorizations
            };
        }
        
        // The agentId is passed as a query parameter via the apiService, not in the request body.
        const agentId = formData.agentId.trim() || undefined;
        await api.createAgent(createPayload, config, agentId);
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to save agent.');
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

  return (
    <div className="bg-gray-800 shadow-xl rounded-lg p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-start mb-6">
        <h2 className="text-2xl font-bold text-white">{agentToEdit ? 'Update Agent' : 'Register New Agent'}</h2>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-white">&larr; Back to list</button>
      </div>
      
      {isEditingDisabled && (
        <div className="bg-yellow-900/30 border border-yellow-700 text-yellow-300 text-sm rounded-md p-3 mb-6" role="alert">
            Editing is disabled for this agent because it is a private no-code agent. Its configuration cannot be modified.
        </div>
      )}

      {rewriteError && <p className="text-red-400 text-sm mb-4">{rewriteError}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Column 1: The Form */}
        <form id="agent-form" onSubmit={handleSubmit} className="space-y-4">
            <fieldset disabled={isEditingDisabled} className="space-y-4">
                {/* Fields */}
                <div><label htmlFor="displayName" className="block text-sm font-medium text-gray-300">Display Name</label><input type="text" name="displayName" value={formData.displayName} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm disabled:bg-gray-700/50 disabled:cursor-not-allowed" required /></div>
                <div>
                    <div className="flex justify-between items-center">
                        <label htmlFor="description" className="block text-sm font-medium text-gray-300">Description</label>
                        <AiRewriteButton field="description" />
                    </div>
                    <textarea name="description" value={formData.description} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm disabled:bg-gray-700/50 disabled:cursor-not-allowed" required />
                </div>
                {!agentToEdit && (
                  <div>
                    <label htmlFor="agentId" className="block text-sm font-medium text-gray-300">Agent ID (Optional)</label>
                    <input type="text" name="agentId" value={formData.agentId} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm" pattern="[a-z0-9-]{1,63}" title="Must be lowercase letters, numbers, and hyphens, up to 63 characters." />
                    <p className="mt-1 text-xs text-gray-400">If left blank, a unique ID will be generated. Must be lowercase, numbers, and hyphens.</p>
                  </div>
                )}
                <div>
                    <label htmlFor="iconUri" className="block text-sm font-medium text-gray-300">Icon URI</label>
                    <input type="text" name="iconUri" value={formData.iconUri} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm disabled:bg-gray-700/50 disabled:cursor-not-allowed" />
                    {formData.iconUri && !iconPreviewError && (
                    <img
                        src={formData.iconUri}
                        alt="Icon Preview"
                        className="mt-2 h-16 w-16 rounded-md object-cover bg-gray-600"
                        onError={() => setIconPreviewError(true)}
                    />
                    )}
                </div>
                
                <div className="border-t border-gray-700 pt-4">
                    <label className="block text-sm font-medium text-gray-300">Starter Prompts</label>
                    <p className="mt-1 text-xs text-gray-400">Suggestions to show the user on the agent's landing page.</p>
                    <div className="mt-2 space-y-2">
                        {formData.starterPrompts.map((prompt, index) => (
                            <div key={index} className="flex items-center space-x-2">
                                <input
                                    type="text"
                                    value={prompt}
                                    onChange={(e) => handleStarterPromptChange(index, e.target.value)}
                                    placeholder={`Prompt #${index + 1}`}
                                    className="block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm disabled:bg-gray-700/50 disabled:cursor-not-allowed"
                                />
                                <button
                                    type="button"
                                    onClick={() => removeStarterPrompt(index)}
                                    className="p-2 text-gray-400 hover:text-white bg-gray-600 hover:bg-red-500 rounded-md disabled:bg-gray-600 disabled:cursor-not-allowed"
                                    aria-label="Remove prompt"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={addStarterPrompt}
                        className="mt-2 text-sm font-semibold text-blue-400 hover:text-blue-300 disabled:text-gray-500 disabled:cursor-not-allowed"
                    >
                        + Add Prompt
                    </button>
                </div>

                <div>
                          <label className="block text-sm font-medium text-gray-300">
                              Authorization IDs {agentToEdit ? '(Immutable)' : '(Optional)'}
                    </label>
                    {agentToEdit ? (
                        <>
                                  <div className="space-y-2 mt-1">
                                      {formData.authIds.map((authId, index) => (
                                    <input
                                        key={index}
                                        type="text"
                                        value={authId}
                                        className="block w-full bg-gray-800 border-gray-600 rounded-md shadow-sm text-gray-400 disabled:opacity-75"
                                        disabled
                                    />
                                ))}
                                  </div>
                            <p className="mt-1 text-xs text-gray-400">Authorization cannot be changed after an agent is created.</p>
                        </>
                    ) : (
                        <>
                                      <div className="space-y-2 mt-1">
                                          {formData.authIds.map((authId, index) => (
                                              <div key={index} className="flex items-center space-x-2">
                                                  {authInputMode === 'select' && authorizations.length > 0 ? (
                                            <select
                                                value={authId}
                                                onChange={(e) => handleAuthIdChange(index, e.target.value)}
                                                className="block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm"
                                            >
                                                <option value="">-- Select an Authorization --</option>
                                                {authorizations.map(auth => {
                                                    const aId = auth.name.split('/').pop() || '';
                                                    return <option key={auth.name} value={aId}>{auth.displayName || aId}</option>;
                                                })}
                                            </select>
                                        ) : (
                                            <input
                                                type="text"
                                                value={authId}
                                                onChange={(e) => handleAuthIdChange(index, e.target.value)}
                                                className="block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm"
                                                placeholder="Type an ID"
                                            />
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => removeAuthId(index)}
                                            className="p-2 text-gray-400 hover:text-white bg-gray-600 hover:bg-red-500 rounded-md transition-colors"
                                            title="Remove Authorization"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                                      </div>

                                      <div className="flex justify-between items-center mt-2">
                                          <button
                                              type="button"
                                              onClick={addAuthId}
                                              className="text-sm font-semibold text-blue-400 hover:text-blue-300 disabled:text-gray-500 disabled:cursor-not-allowed"
                                          >
                                              + Add Authorization
                                          </button>

                                          <div className="flex gap-2">
                                              {authInputMode === 'select' && (
                                                  <button type="button" onClick={() => setAuthInputMode('manual')} className="text-sm text-blue-400 hover:text-blue-300">
                                                      Switch to Manual
                                                  </button>
                                              )}
                                              <button type="button" onClick={handleLoadAuthorizations} disabled={isLoadingAuths} className="px-3 py-1 bg-indigo-600 text-white text-xs font-semibold rounded-md hover:bg-indigo-700 disabled:bg-gray-500" title="Load available authorizations">
                                                  {isLoadingAuths ? '...' : 'Load'}
                                              </button>
                                          </div>
                                      </div>

                            {authLoadError && <p className="mt-1 text-sm text-red-400">{authLoadError}</p>}
                        </>
                    )}
                </div>

                <div className="space-y-4 border-t border-gray-700 p-4 rounded-md">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold text-white">Backend Configuration</h3>
                        <div className="flex bg-gray-700 rounded-md p-1">
                            <button
                                type="button"
                                onClick={() => !agentToEdit && setAgentType('reasoning_engine')}
                                className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${agentType === 'reasoning_engine' ? 'bg-gray-600 text-white shadow' : 'text-gray-400 hover:text-white'} ${agentToEdit ? 'cursor-not-allowed opacity-70' : ''}`}
                                disabled={!!agentToEdit}
                            >
                                      Agent Engine
                            </button>
                            <button
                                type="button"
                                onClick={() => !agentToEdit && setAgentType('a2a')}
                                className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${agentType === 'a2a' ? 'bg-gray-600 text-white shadow' : 'text-gray-400 hover:text-white'} ${agentToEdit ? 'cursor-not-allowed opacity-70' : ''}`}
                                disabled={!!agentToEdit}
                            >
                                HTTP Service (A2A)
                            </button>
                        </div>
                    </div>

                    {agentType === 'reasoning_engine' ? (
                        <>
                            <div className="space-y-3">
                                <div>
                                    <label htmlFor="createdBy" className="block text-sm font-medium text-gray-300">Created By</label>
                                    <input type="text" name="createdBy" value={formData.createdBy} onChange={handleChange} placeholder="e.g., your-name@example.com" className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm disabled:bg-gray-700/50 disabled:cursor-not-allowed" />
                                </div>
                                <div>
                                    <label htmlFor="additionalInfo" className="block text-sm font-medium text-gray-300">Additional Info</label>
                                    <textarea name="additionalInfo" value={formData.additionalInfo} onChange={handleChange} rows={3} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm disabled:bg-gray-700/50 disabled:cursor-not-allowed" />
                                </div>
                            </div>
                            <div className="flex items-center space-x-3 mb-2">
                                <input
                                    type="checkbox"
                                    id="isCrossProject"
                                    checked={isCrossProject}
                                    onChange={(e) => {
                                        setIsCrossProject(e.target.checked);
                                        if (!e.target.checked) {
                                            setSourceProjectId(config.projectId || '');
                                        }
                                    }}
                                    disabled={isEditingDisabled}
                                    className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                                />
                                <label htmlFor="isCrossProject" className="text-sm font-medium text-gray-300">Cross-Project Agent Engine (Runtime)</label>
                            </div>
                            {isCrossProject && (
                                <div className="mb-2">
                                    <label htmlFor="sourceProjectId" className="block text-sm font-medium text-gray-300">Source Project ID / Number</label>
                                    <input
                                        type="text"
                                        id="sourceProjectId"
                                        value={sourceProjectId}
                                        onChange={(e) => setSourceProjectId(e.target.value)}
                                        placeholder="e.g. 474791121936"
                                        disabled={isEditingDisabled}
                                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm"
                                        required
                                    />
                                </div>
                            )}
                            <div>
                                <label htmlFor="reasoningEngineLocation" className="block text-sm font-medium text-gray-300">Agent Engine Location</label>
                                <div className="flex items-center space-x-2 mt-1">
                                    <input 
                                        type="text" 
                                        name="reasoningEngineLocation" 
                                        value={formData.reasoningEngineLocation} 
                                        className="block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-gray-400 cursor-not-allowed"
                                        disabled={isEditingDisabled}
                                        readOnly 
                                    />
                                    <button type="button" onClick={handleLoadEngines} disabled={isLoadingEngines || !formData.reasoningEngineLocation || isEditingDisabled} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-md hover:bg-indigo-700 disabled:bg-gray-500">{isLoadingEngines ? '...' : 'Load'}</button>
                                </div>
                                <p className="mt-1 text-xs text-gray-400">This is automatically set based on the Agent's Location (`{config.appLocation}`) to ensure compatibility.</p>
                            </div>
                            {engineLoadError && <p className="text-sm text-red-400">{engineLoadError}</p>}
                            {reasoningEngines.length > 0 && (
                                <div>
                                    <label htmlFor="engineSelect" className="block text-sm font-medium text-gray-300">Select an Agent Engine</label>
                                    <select id="engineSelect" onChange={handleEngineSelect} value={reasoningEngines.find(re => re.name.endsWith(`/${formData.reasoningEngineId}`))?.name || ''} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-white disabled:bg-gray-700/50 disabled:cursor-not-allowed">
                                        <option value="">-- Manually Entered --</option>
                                        {reasoningEngines.map(engine => (<option key={engine.name} value={engine.name}>{engine.displayName} ({engine.name.split('/').pop()})</option>))}
                                    </select>
                                </div>
                            )}
                            <div><label htmlFor="reasoningEngineId" className="block text-sm font-medium text-gray-300">Agent Engine ID</label><input type="text" name="reasoningEngineId" value={formData.reasoningEngineId} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm disabled:bg-gray-700/50 disabled:cursor-not-allowed" required /></div>
                        </>
                    ) : (
                        <>
                            <div>
                                <label htmlFor="a2aUrl" className="block text-sm font-medium text-gray-300">Invoke URL (Required)</label>
                                <div className="flex gap-2 items-center">
                                    <input 
                                        type="url" 
                                        name="a2aUrl" 
                                        value={formData.a2aUrl} 
                                        onChange={handleChange} 
                                        placeholder="https://my-service.run.app/invoke" 
                                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm disabled:bg-gray-700/50 disabled:cursor-not-allowed" 
                                        required 
                                    />
                                    <button 
                                        type="button" 
                                        onClick={() => setUseCloudRunPicker(!useCloudRunPicker)}
                                        className="mt-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-md text-gray-300 text-xs whitespace-nowrap"
                                    >
                                        {useCloudRunPicker ? 'Cancel Scan' : 'Pick from Cloud Run'}
                                    </button>
                                </div>
                                <p className="mt-1 text-xs text-gray-400">The full HTTP endpoint used to invoke the agent (e.g. including `/invoke` or any custom path).</p>
                            </div>
                            
                            {useCloudRunPicker && (
                                <div className="bg-gray-900/50 p-3 rounded-md border border-gray-700 space-y-3">
                                    <h4 className="text-sm font-bold text-gray-300">Scan for Cloud Run Services</h4>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1">Region</label>
                                            <select 
                                                value={cloudRunRegion} 
                                                onChange={(e) => setCloudRunRegion(e.target.value)} 
                                                className="w-full bg-gray-700 border-gray-600 rounded-md text-xs p-1.5"
                                            >
                                                <option value="us-central1">us-central1</option><option value="us-east1">us-east1</option><option value="us-east4">us-east4</option><option value="us-west1">us-west1</option><option value="europe-west1">europe-west1</option><option value="europe-west2">europe-west2</option><option value="europe-west4">europe-west4</option><option value="asia-east1">asia-east1</option><option value="asia-southeast1">asia-southeast1</option>
                                            </select>
                                        </div>
                                        <div className="flex items-end">
                                            <button 
                                                type="button" 
                                                onClick={handleLoadServices}
                                                disabled={isLoadingServices} 
                                                className="w-full px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-md hover:bg-indigo-700 disabled:opacity-50"
                                            >
                                                {isLoadingServices ? 'Scanning...' : 'Scan'}
                                            </button>
                                        </div>
                                    </div>
                                    
                                    {cloudRunServices.length > 0 && (
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1">Select Service</label>
                                            <select 
                                                onChange={handleServiceSelect}
                                                value={formData.a2aUrl}
                                                className="w-full bg-gray-700 border-gray-600 rounded-md text-xs p-1.5"
                                            >
                                                <option value="">-- Select a Service --</option>
                                                {cloudRunServices.map(s => (
                                                    <option key={s.name} value={s.uri}>
                                                        {s.name.split('/').pop()} ({s.uri})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div>
                                <label htmlFor="a2aOrg" className="block text-sm font-medium text-gray-300">Provider Organization</label>
                                <input type="text" name="a2aOrg" value={formData.a2aOrg} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm disabled:bg-gray-700/50 disabled:cursor-not-allowed" />
                            </div>

                            <div>
                                <label className="flex items-center space-x-3 mb-2 cursor-pointer mt-4">
                                    <input 
                                        type="checkbox" 
                                        checked={a2aStreaming} 
                                        onChange={(e) => setA2aStreaming(e.target.checked)} 
                                        className="form-checkbox h-4 w-4 text-teal-500 rounded border-gray-600 bg-gray-800 focus:ring-teal-500"
                                        disabled={isEditingDisabled}
                                    />
                                    <span className="text-sm font-medium text-gray-300">Enable Streaming</span>
                                </label>
                            </div>

                            {/* Extensions list */}
                            <div className="mt-4 border-t border-gray-700/50 pt-4">
                                <label className="block text-sm font-medium text-gray-300 mb-2">Agent Extensions / DCR Registration</label>
                                {a2aExtensions.map((ext, idx) => (
                                    <div key={idx} className="bg-gray-900/50 p-3 rounded-md border border-gray-700/50 mb-3 space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-semibold text-gray-400">Extension #{idx + 1}</span>
                                            <button 
                                                type="button" 
                                                onClick={() => setA2aExtensions(prev => prev.filter((_, i) => i !== idx))} 
                                                className="text-xs text-red-400 hover:underline"
                                                disabled={isEditingDisabled}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                        <div>
                                            <label className="block text-[11px] text-gray-500">Extension URI</label>
                                            <input 
                                                type="text" 
                                                value={ext.uri || ''} 
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setA2aExtensions(prev => prev.map((item, i) => i === idx ? { ...item, uri: val } : item));
                                                }}
                                                className="w-full bg-gray-800 border-gray-700 rounded text-xs p-1 mt-0.5 text-gray-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                disabled={isEditingDisabled}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] text-gray-500">Target Registration URL</label>
                                            <input 
                                                type="text" 
                                                value={ext.params?.target_url || ''} 
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setA2aExtensions(prev => prev.map((item, i) => i === idx ? { ...item, params: { ...item.params, target_url: val } } : item));
                                                }}
                                                className="w-full bg-gray-800 border-gray-700 rounded text-xs p-1 mt-0.5 text-gray-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                disabled={isEditingDisabled}
                                            />
                                        </div>
                                    </div>
                                ))}
                                <button 
                                    type="button" 
                                    onClick={() => setA2aExtensions(prev => [...prev, { uri: 'https://cloud.google.com/marketplace/docs/partners/ai-agents/setup-dcr', params: { target_url: '' } }])} 
                                    className="w-full py-1 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 font-semibold transition-colors"
                                    disabled={isEditingDisabled}
                                >
                                    + Add Extension (DCR)
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </fieldset>
        </form>

        {/* Column 2: The Preview */}
        <div>
            <h3 className="text-xl font-semibold text-white">cURL Command Preview</h3>
            <p className="text-sm text-gray-400 mt-1 mb-2">
                {agentToEdit
                    ? "This command reflects changes made in the form for updating the agent."
                    : "This command reflects the current form settings for registering a new agent."}
            </p>
            <div className="bg-gray-900 rounded-lg p-4 relative" style={{ maxHeight: 'calc(100vh - 25rem)', overflowY: 'auto' }}>
                <button
                    onClick={handleCopyCurlCommand}
                    className="absolute top-3 right-3 px-3 py-1 bg-gray-600 text-white text-xs font-semibold rounded-md hover:bg-gray-500 z-10"
                >
                    {copySuccessCurl ? 'Copied!' : 'Copy'}
                </button>
                <pre className="text-xs text-gray-300 whitespace-pre-wrap">
                    <code>
                        {curlCommand}
                    </code>
                </pre>
            </div>
        </div>
      </div>

       {/* Buttons and Error outside the grid, at the bottom of the component */}
      <div className="mt-6">
        {error && <p className="text-red-400 mb-4 text-center">{error}</p>}
        <div className="flex justify-end space-x-3 border-t border-gray-700 pt-4">
            <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">Cancel</button>
            <button type="submit" form="agent-form" disabled={isSubmitting || isEditingDisabled} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed">{isSubmitting ? 'Saving...' : 'Save Agent'}</button>
        </div>
      </div>
    </div>
  );
};

export default AgentForm;
