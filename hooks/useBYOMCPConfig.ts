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

import { useState, useEffect, useMemo } from 'react';
import * as api from '../services/apiService';
import { Config, DataConnector } from '../types';
import { toErrorMessage } from '../utils/errors';
import {
  DynamicToolItem,
  CustomParamItem,
  InstructionPreset,
  KNOWN_ACTION_PARAM_KEYS,
} from '../components/connectors/byomcp/types';

interface UseBYOMCPConfigProps {
  connector: DataConnector;
  config: Config;
  onConnectorUpdated?: (updatedConnector: DataConnector) => void;
  onRefreshSuccess?: () => void;
}

export function useBYOMCPConfig({
  connector,
  config,
  onConnectorUpdated,
  onRefreshSuccess,
}: UseBYOMCPConfigProps) {
  const [editorMode, setEditorMode] = useState<'visual' | 'json'>('visual');

  // Form Fields State
  const [mcpServerDescription, setMcpServerDescription] = useState<string>('');
  const [mcpAgentInstructions, setMcpAgentInstructions] = useState<string>('');
  const [instanceUri, setInstanceUri] = useState<string>('');
  const [authType, setAuthType] = useState<string>('OAUTH');
  const [scopes, setScopes] = useState<string>('');
  const [authUri, setAuthUri] = useState<string>('');
  const [tokenUri, setTokenUri] = useState<string>('');
  const [authUriParams, setAuthUriParams] = useState<string>('');
  const [clientId, setClientId] = useState<string>('');
  const [clientSecret, setClientSecret] = useState<string>('');
  const [showClientSecret, setShowClientSecret] = useState<boolean>(false);
  const [mcpServerSource, setMcpServerSource] = useState<string>('BYO_MCP');
  const [registryMcpServerName, setRegistryMcpServerName] = useState<string>('');
  const [customActionParams, setCustomActionParams] = useState<CustomParamItem[]>([]);

  // Tools & BAP Config
  const [dynamicTools, setDynamicTools] = useState<DynamicToolItem[]>([]);
  const [isRefreshingTools, setIsRefreshingTools] = useState<boolean>(false);
  const [refreshToolsError, setRefreshToolsError] = useState<string | null>(null);
  const [refreshToolsSuccess, setRefreshToolsSuccess] = useState<boolean>(false);

  // General Connector Settings
  const [refreshInterval, setRefreshInterval] = useState<string>('86400s');
  const [staticIpEnabled, setStaticIpEnabled] = useState<boolean>(false);

  // JSON Mode State
  const [rawJsonText, setRawJsonText] = useState<string>('');
  const [rawJsonError, setRawJsonError] = useState<string | null>(null);
  const [customUpdateMask, setCustomUpdateMask] = useState<string>('action_config.action_params');
  const [useAutoUpdateMask, setUseAutoUpdateMask] = useState<boolean>(true);

  // Save / Action State
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copiedCurl, setCopiedCurl] = useState<boolean>(false);
  const [copiedJson, setCopiedJson] = useState<boolean>(false);
  const [showAdvancedAuth, setShowAdvancedAuth] = useState<boolean>(false);

  // Connectivity Test State
  const [isTestingConnectivity, setIsTestingConnectivity] = useState<boolean>(false);
  const [connectivityResult, setConnectivityResult] = useState<{ status: 'ok' | 'fail'; message: string } | null>(null);

  // Initialize form from connector prop
  useEffect(() => {
    if (!connector) return;

    const actionParams = connector.actionConfig?.actionParams || {};
    const params = connector.params || {};

    const desc = actionParams.mcp_server_description || '';
    const inst = actionParams.mcp_agent_instructions || '';
    const uri = actionParams.instance_uri || params.instance_uri || '';
    const aType = actionParams.auth_type || 'OAUTH';
    const sc = actionParams.scopes || '';
    const aUri = actionParams.auth_uri || '';
    const tUri = actionParams.token_uri || '';
    const aParams = actionParams.auth_uri_params || '';
    const cId = actionParams.client_id || '';
    const cSecret = actionParams.client_secret || '';
    const mSource = actionParams.mcp_server_source || 'BYO_MCP';
    const regName = actionParams.registry_mcp_server_name || '';

    setMcpServerDescription(desc);
    setMcpAgentInstructions(inst);
    setInstanceUri(uri);
    setAuthType(aType);
    setScopes(sc);
    setAuthUri(aUri);
    setTokenUri(tUri);
    setAuthUriParams(aParams);
    setClientId(cId);
    setClientSecret(cSecret);
    setMcpServerSource(mSource);
    setRegistryMcpServerName(regName);

    // Custom action params
    const customList: CustomParamItem[] = [];
    Object.entries(actionParams).forEach(([k, v]) => {
      if (!KNOWN_ACTION_PARAM_KEYS.has(k)) {
        customList.push({ key: k, value: typeof v === 'object' ? JSON.stringify(v) : String(v) });
      }
    });
    setCustomActionParams(customList);

    // Dynamic Tools & Enabled Actions
    const enabledActions: string[] = connector.bapConfig?.enabledActions || [];
    const dynTools: DynamicToolItem[] = [];

    if (Array.isArray(connector.dynamicTools) && connector.dynamicTools.length > 0) {
      connector.dynamicTools.forEach((t: { name: string; displayName?: string; description?: string; enabled?: boolean }) => {
        const isEnabled = t.enabled !== undefined ? Boolean(t.enabled) : enabledActions.includes(t.name);
        dynTools.push({
          name: t.name,
          displayName: t.displayName || t.name,
          description: t.description || '',
          enabled: isEnabled,
        });
      });
    } else if (enabledActions.length > 0) {
      enabledActions.forEach((act) => {
        dynTools.push({
          name: act,
          displayName: act,
          description: '',
          enabled: true,
        });
      });
    }
    setDynamicTools(dynTools);

    // Interval & Static IP
    setRefreshInterval(connector.refreshInterval || '86400s');
    setStaticIpEnabled(Boolean(connector.staticIpEnabled ?? connector.params?.static_ip_enabled));

    // Reset feedback
    setSaveSuccess(false);
    setSaveError(null);
    setRefreshToolsError(null);
    setRefreshToolsSuccess(false);
    setConnectivityResult(null);
  }, [connector]);

  // Construct targeted payload & computed update mask based on modified fields
  const { targetedPayload, computedUpdateMask } = useMemo(() => {
    // 1. Raw JSON Mode
    if (editorMode === 'json') {
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(rawJsonText);
      } catch {
        parsed = null;
      }

      if (!useAutoUpdateMask && customUpdateMask.trim()) {
        return {
          targetedPayload: parsed || {},
          computedUpdateMask: customUpdateMask.split(',').map((s) => s.trim()).filter(Boolean),
        };
      }

      const masks = new Set<string>();
      if (parsed) {
        const actionConfig = parsed.actionConfig as { actionParams?: Record<string, unknown> } | undefined;
        if (actionConfig?.actionParams && Object.keys(actionConfig.actionParams).length > 0) {
          masks.add('action_config.action_params');
        }
        if (Array.isArray(parsed.dynamicTools) && parsed.dynamicTools.length > 0) {
          masks.add('dynamic_tools');
        }
        if (parsed.bapConfig) {
          masks.add('bap_config');
        }
        const params = parsed.params as { instance_uri?: unknown } | undefined;
        if (params?.instance_uri !== undefined) {
          masks.add('params.instance_uri');
        }
        if (parsed.refreshInterval !== undefined) {
          masks.add('refresh_interval');
        }
        if (parsed.staticIpEnabled !== undefined) {
          masks.add('static_ip_enabled');
        }
      }
      return {
        targetedPayload: parsed || {},
        computedUpdateMask: masks.size > 0 ? Array.from(masks) : ['action_config.action_params'],
      };
    }

    // 2. Visual Form Mode: Diff against initial connector state
    const origActionParams = connector?.actionConfig?.actionParams || {};
    const origDesc = origActionParams.mcp_server_description || '';
    const origInst = origActionParams.mcp_agent_instructions || '';
    const origUri = origActionParams.instance_uri || connector?.params?.instance_uri || '';
    const origInterval = connector?.refreshInterval || '86400s';
    const origStaticIp = Boolean(connector?.staticIpEnabled ?? connector?.params?.static_ip_enabled);

    const descChanged = mcpServerDescription !== origDesc;
    const instChanged = mcpAgentInstructions !== origInst;
    const uriChanged = instanceUri.trim() !== origUri;
    const intervalChanged = refreshInterval !== origInterval;
    const staticIpChanged = staticIpEnabled !== origStaticIp;

    const origEnabledActions = (connector?.bapConfig?.enabledActions || []).slice().sort().join(',');
    const currentEnabledActions = dynamicTools.filter((t) => t.enabled).map((t) => t.name).slice().sort().join(',');
    const toolsChanged = (
      origEnabledActions !== currentEnabledActions ||
      dynamicTools.length !== (connector?.dynamicTools || []).length
    );

    const customChanged = customActionParams.length > 0;
    const authChanged = Boolean(clientId.trim());

    // If no changes detected, default to updating action_params with current description & instructions
    const actionParamsChanged = descChanged || instChanged || customChanged || authChanged;
    const hasAnyChange = actionParamsChanged || toolsChanged || uriChanged || intervalChanged || staticIpChanged;

    const masks: string[] = [];
    const payload: Record<string, unknown> = {};

    // 1. Action Params
    if (actionParamsChanged || !hasAnyChange) {
      masks.push('action_config.action_params');
      const actionParamsPayload: Record<string, unknown> = {};

      if (mcpServerDescription.trim()) {
        actionParamsPayload.mcp_server_description = mcpServerDescription.trim();
      }
      if (mcpAgentInstructions.trim()) {
        actionParamsPayload.mcp_agent_instructions = mcpAgentInstructions.trim();
      }
      if (mcpServerSource.trim()) {
        actionParamsPayload.mcp_server_source = mcpServerSource.trim();
      }
      if (registryMcpServerName.trim()) {
        actionParamsPayload.registry_mcp_server_name = registryMcpServerName.trim();
      }

      if (authChanged) {
        actionParamsPayload.client_id = clientId.trim();
        if (clientSecret.trim()) actionParamsPayload.client_secret = clientSecret.trim();
        if (authType) actionParamsPayload.auth_type = authType;
        if (scopes.trim()) actionParamsPayload.scopes = scopes.trim();
        if (authUri.trim()) actionParamsPayload.auth_uri = authUri.trim();
        if (tokenUri.trim()) actionParamsPayload.token_uri = tokenUri.trim();
        if (authUriParams.trim()) actionParamsPayload.auth_uri_params = authUriParams.trim();
        if (instanceUri.trim()) actionParamsPayload.instance_uri = instanceUri.trim();
      } else if (authType && authType !== 'OAUTH') {
        actionParamsPayload.auth_type = authType;
        if (instanceUri.trim()) actionParamsPayload.instance_uri = instanceUri.trim();
      }

      customActionParams.forEach((item) => {
        const k = item.key.trim();
        if (k) {
          try {
            actionParamsPayload[k] = JSON.parse(item.value);
          } catch {
            actionParamsPayload[k] = item.value;
          }
        }
      });

      payload.actionConfig = {
        ...(connector?.actionConfig || {}),
        actionParams: actionParamsPayload,
      };
    }

    // 2. Dynamic Tools
    if (toolsChanged) {
      masks.push('dynamic_tools');
      masks.push('bap_config');
      payload.dynamicTools = dynamicTools.map((t) => ({
        name: t.name,
        displayName: t.displayName || t.name,
        description: t.description || '',
        enabled: t.enabled,
      }));
      payload.bapConfig = {
        ...(connector?.bapConfig || {}),
        enabledActions: dynamicTools.filter((t) => t.enabled).map((t) => t.name),
      };
    }

    // 3. Instance URI
    if (uriChanged && instanceUri.trim()) {
      masks.push('params.instance_uri');
      payload.params = {
        ...(connector?.params || {}),
        instance_uri: instanceUri.trim(),
      };
    }

    // 4. Refresh Interval
    if (intervalChanged) {
      masks.push('refresh_interval');
      payload.refreshInterval = refreshInterval;
    }

    // 5. Static IP
    if (staticIpChanged) {
      masks.push('static_ip_enabled');
      payload.staticIpEnabled = staticIpEnabled;
    }

    return {
      targetedPayload: payload,
      computedUpdateMask: masks.length > 0 ? masks : ['action_config.action_params'],
    };
  }, [
    editorMode,
    rawJsonText,
    useAutoUpdateMask,
    customUpdateMask,
    connector,
    mcpServerDescription,
    mcpAgentInstructions,
    instanceUri,
    refreshInterval,
    staticIpEnabled,
    dynamicTools,
    customActionParams,
    clientId,
    clientSecret,
    authType,
    scopes,
    authUri,
    tokenUri,
    authUriParams,
    mcpServerSource,
    registryMcpServerName,
  ]);

  // Sync to JSON mode text when switching or when payload updates
  useEffect(() => {
    if (editorMode === 'json' && !rawJsonText) {
      setRawJsonText(JSON.stringify(targetedPayload, null, 2));
      setRawJsonError(null);
    }
  }, [editorMode, targetedPayload, rawJsonText]);

  // Helper to parse raw JSON and update form states
  const applyParsedJsonToForm = (parsed: Record<string, unknown>) => {
    const actionConfig = parsed.actionConfig as { actionParams?: Record<string, unknown> } | undefined;
    const actionParams = actionConfig?.actionParams || (parsed.actionParams as Record<string, unknown>) || {};
    const params = (parsed.params as Record<string, unknown>) || {};

    if (actionParams.mcp_server_description !== undefined) {
      setMcpServerDescription(String(actionParams.mcp_server_description));
    }
    if (actionParams.mcp_agent_instructions !== undefined) {
      setMcpAgentInstructions(String(actionParams.mcp_agent_instructions));
    }
    if (actionParams.instance_uri || params.instance_uri) {
      setInstanceUri(String(actionParams.instance_uri || params.instance_uri));
    }
    if (actionParams.auth_type !== undefined) {
      setAuthType(String(actionParams.auth_type));
    }
    if (actionParams.scopes !== undefined) {
      setScopes(String(actionParams.scopes));
    }
    if (actionParams.auth_uri !== undefined) {
      setAuthUri(String(actionParams.auth_uri));
    }
    if (actionParams.token_uri !== undefined) {
      setTokenUri(String(actionParams.token_uri));
    }
    if (actionParams.auth_uri_params !== undefined) {
      setAuthUriParams(String(actionParams.auth_uri_params));
    }
    if (actionParams.client_id !== undefined) {
      setClientId(String(actionParams.client_id));
    }
    if (actionParams.client_secret !== undefined) {
      setClientSecret(String(actionParams.client_secret));
    }
    if (actionParams.mcp_server_source !== undefined) {
      setMcpServerSource(String(actionParams.mcp_server_source));
    }
    if (actionParams.registry_mcp_server_name !== undefined) {
      setRegistryMcpServerName(String(actionParams.registry_mcp_server_name));
    }

    if (Array.isArray(parsed.dynamicTools)) {
      setDynamicTools(
        (parsed.dynamicTools as Array<{ name: string; displayName?: string; description?: string; enabled?: boolean }>).map((t) => ({
          name: t.name,
          displayName: t.displayName || t.name,
          description: t.description || '',
          enabled: t.enabled !== undefined ? Boolean(t.enabled) : true,
        }))
      );
    }

    if (parsed.refreshInterval !== undefined) {
      setRefreshInterval(String(parsed.refreshInterval));
    }
    if (parsed.staticIpEnabled !== undefined) {
      setStaticIpEnabled(Boolean(parsed.staticIpEnabled));
    }
  };

  // Handle switching editor mode
  const handleSwitchMode = (mode: 'visual' | 'json') => {
    if (mode === 'json') {
      setRawJsonText(JSON.stringify(targetedPayload, null, 2));
      setRawJsonError(null);
    } else {
      if (rawJsonText && !rawJsonError) {
        try {
          const parsed = JSON.parse(rawJsonText);
          applyParsedJsonToForm(parsed);
        } catch (e: unknown) {
          setRawJsonError(`Invalid JSON: ${toErrorMessage(e)}`);
          return;
        }
      }
    }
    setEditorMode(mode);
  };

  // Test live MCP connectivity
  const handleTestConnectivity = async () => {
    const uri = instanceUri.trim();
    if (!uri) {
      setConnectivityResult({ status: 'fail', message: 'Please enter an MCP instance URI first.' });
      return;
    }
    setIsTestingConnectivity(true);
    setConnectivityResult(null);

    try {
      const parts = (connector.name || '').split('/');
      const projId = parts[parts.indexOf('projects') + 1] || config.projectId;
      const tools = await api.listMcpTools(projId, uri);
      if (!tools || tools.length === 0) {
        setConnectivityResult({ status: 'fail', message: 'Connected to endpoint, but server returned 0 tools.' });
      } else {
        setConnectivityResult({
          status: 'ok',
          message: `Successfully connected! Server reported ${tools.length} available tools (${tools.map((t) => t.name).slice(0, 4).join(', ')}${tools.length > 4 ? '...' : ''}).`,
        });
      }
    } catch (e: unknown) {
      setConnectivityResult({ status: 'fail', message: `Connectivity failed: ${toErrorMessage(e) || 'Error reaching server.'}` });
    } finally {
      setIsTestingConnectivity(false);
    }
  };

  // Refresh dynamic tools directly from MCP endpoint
  const handleRefreshToolsFromEndpoint = async () => {
    const uri = instanceUri.trim();
    if (!uri) {
      setRefreshToolsError('No MCP instance URI specified.');
      return;
    }
    setIsRefreshingTools(true);
    setRefreshToolsError(null);
    setRefreshToolsSuccess(false);

    try {
      const parts = (connector.name || '').split('/');
      const projId = parts[parts.indexOf('projects') + 1] || config.projectId;
      const tools = await api.listMcpTools(projId, uri);

      if (!tools || tools.length === 0) {
        throw new Error('No tools returned by the MCP server at the specified URI.');
      }

      // Merge with existing enabled states if tool name matches
      const existingMap = new Map(dynamicTools.map((t) => [t.name, t]));
      const newToolList: DynamicToolItem[] = tools.map((t: { name: string; description?: string; [key: string]: unknown }) => {
        const existing = existingMap.get(t.name);
        return {
          name: t.name,
          displayName: existing?.displayName || t.name,
          description: t.description || existing?.description || '',
          enabled: existing ? existing.enabled : true,
        };
      });

      setDynamicTools(newToolList);
      setRefreshToolsSuccess(true);
    } catch (err: unknown) {
      console.error('Failed to fetch tools from MCP:', err);
      setRefreshToolsError(toErrorMessage(err) || 'Failed to fetch tools.');
    } finally {
      setIsRefreshingTools(false);
    }
  };

  // Apply a template preset
  const handleApplyPreset = (preset: InstructionPreset) => {
    setMcpAgentInstructions(preset.instructions);
    if (!mcpServerDescription.trim() || mcpServerDescription === 'testmcp') {
      setMcpServerDescription(preset.serverDescription);
    }
    if (preset.dynamicTools && preset.dynamicTools.length > 0) {
      const merged = [...dynamicTools];
      preset.dynamicTools.forEach((tool) => {
        if (!merged.some((t) => t.name === tool.name)) {
          merged.push(tool);
        }
      });
      setDynamicTools(merged);
    }
  };

  // Toggle tool enabled state
  const handleToggleTool = (toolName: string) => {
    setDynamicTools((prev) =>
      prev.map((t) => (t.name === toolName ? { ...t, enabled: !t.enabled } : t))
    );
  };

  // Toggle all tools
  const handleToggleAllTools = (enable: boolean) => {
    setDynamicTools((prev) => prev.map((t) => ({ ...t, enabled: enable })));
  };

  // Custom action param handlers
  const handleAddCustomParam = () => {
    setCustomActionParams((prev) => [...prev, { key: '', value: '' }]);
  };

  const handleUpdateCustomParam = (index: number, field: 'key' | 'value', val: string) => {
    setCustomActionParams((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: val };
      return next;
    });
  };

  const handleRemoveCustomParam = (index: number) => {
    setCustomActionParams((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Construct cURL string
  const generatedCurl = useMemo<string>(() => {
    if (!connector || !connector.name) return '';
    const parts = connector.name.split('/');
    const projId = parts[parts.indexOf('projects') + 1] || config.projectId || '<PROJECT_ID>';
    const loc = parts[parts.indexOf('locations') + 1] || config.appLocation || 'global';
    const collId = parts[parts.indexOf('collections') + 1] || config.collectionId || 'default_collection';
    const host = loc === 'global' ? 'discoveryengine.googleapis.com' : `${loc}-discoveryengine.googleapis.com`;

    const maskStr = computedUpdateMask.join(',');

    let payloadToPrint: Record<string, unknown> = {};
    if (editorMode === 'json' && rawJsonText && !rawJsonError) {
      try {
        payloadToPrint = JSON.parse(rawJsonText);
      } catch {
        payloadToPrint = targetedPayload;
      }
    } else {
      payloadToPrint = targetedPayload;
    }

    return `curl -X PATCH \\
  -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \\
  -H "Content-Type: application/json" \\
  -H "x-goog-user-project: ${projId}" \\
  "https://${host}/v1alpha/projects/${projId}/locations/${loc}/collections/${collId}/dataConnector?updateMask=${maskStr}" \\
  -d '${JSON.stringify(payloadToPrint, null, 2).replace(/'/g, "'\\''")}'`;
  }, [connector, config, computedUpdateMask, editorMode, rawJsonText, rawJsonError, targetedPayload]);

  // Copy cURL to clipboard
  const handleCopyCurl = () => {
    if (!generatedCurl) return;
    navigator.clipboard.writeText(generatedCurl);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2500);
  };

  // Copy JSON payload
  const handleCopyJson = () => {
    const jsonStr =
      editorMode === 'json' && rawJsonText && !rawJsonError
        ? rawJsonText
        : JSON.stringify(targetedPayload, null, 2);
    navigator.clipboard.writeText(jsonStr);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2500);
  };

  // Format / Beautify JSON in raw editor
  const handleBeautifyJson = () => {
    try {
      const parsed = JSON.parse(rawJsonText);
      setRawJsonText(JSON.stringify(parsed, null, 2));
      setRawJsonError(null);
    } catch (e: unknown) {
      setRawJsonError(`Cannot beautify: ${toErrorMessage(e)}`);
    }
  };

  // Save changes to GCP Discovery Engine API
  const handleSave = async () => {
    if (!connector || !connector.name) {
      setSaveError('No valid connector resource found.');
      return;
    }

    if (editorMode === 'json' && rawJsonError) {
      setSaveError('Please resolve JSON syntax errors before saving.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const parts = connector.name.split('/');
      const projId = parts[parts.indexOf('projects') + 1] || config.projectId;
      const loc = parts[parts.indexOf('locations') + 1] || config.appLocation;
      const collId = parts[parts.indexOf('collections') + 1] || config.collectionId;

      let payloadToSend: Record<string, unknown> = {};
      if (editorMode === 'json' && rawJsonText) {
        payloadToSend = JSON.parse(rawJsonText);
      } else {
        payloadToSend = targetedPayload;
      }

      const updateMasks = computedUpdateMask;

      const response = await api.updateDataConnector(
        connector.name,
        payloadToSend,
        updateMasks,
        { ...config, projectId: projId, appLocation: loc, collectionId: collId }
      );

      setSaveSuccess(true);
      if (onConnectorUpdated) {
        onConnectorUpdated(response);
      }
      if (onRefreshSuccess) {
        onRefreshSuccess();
      }
    } catch (err: unknown) {
      console.error('Failed to update BYOMCP data connector:', err);
      setSaveError(toErrorMessage(err) || 'Failed to update BYOMCP data connector settings.');
    } finally {
      setIsSaving(false);
    }
  };

  return {
    editorMode,
    setEditorMode,
    mcpServerDescription,
    setMcpServerDescription,
    mcpAgentInstructions,
    setMcpAgentInstructions,
    instanceUri,
    setInstanceUri,
    authType,
    setAuthType,
    scopes,
    setScopes,
    authUri,
    setAuthUri,
    tokenUri,
    setTokenUri,
    authUriParams,
    setAuthUriParams,
    clientId,
    setClientId,
    clientSecret,
    setClientSecret,
    showClientSecret,
    setShowClientSecret,
    mcpServerSource,
    setMcpServerSource,
    registryMcpServerName,
    setRegistryMcpServerName,
    customActionParams,
    dynamicTools,
    isRefreshingTools,
    refreshToolsError,
    refreshToolsSuccess,
    refreshInterval,
    setRefreshInterval,
    staticIpEnabled,
    setStaticIpEnabled,
    rawJsonText,
    setRawJsonText,
    rawJsonError,
    setRawJsonError,
    customUpdateMask,
    setCustomUpdateMask,
    useAutoUpdateMask,
    setUseAutoUpdateMask,
    isSaving,
    saveSuccess,
    saveError,
    copiedCurl,
    copiedJson,
    showAdvancedAuth,
    setShowAdvancedAuth,
    isTestingConnectivity,
    connectivityResult,
    targetedPayload,
    computedUpdateMask,
    handleSwitchMode,
    handleTestConnectivity,
    handleRefreshToolsFromEndpoint,
    handleApplyPreset,
    handleToggleTool,
    handleToggleAllTools,
    handleAddCustomParam,
    handleUpdateCustomParam,
    handleRemoveCustomParam,
    generatedCurl,
    handleCopyCurl,
    handleCopyJson,
    handleBeautifyJson,
    handleSave,
  };
}
