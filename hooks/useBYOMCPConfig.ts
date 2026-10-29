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
  CitationMappingRuleItem,
  KNOWN_ACTION_PARAM_KEYS,
  OAUTH_ACTION_PARAM_KEYS,
  SYSTEM_MANAGED_ACTION_PARAM_KEYS,
} from '../components/connectors/byomcp/types';
import {
  parseCitationMappingsFromApi,
  serializeCitationMappingsToApi,
  validateCitationMappings,
  validateRawCitationMappingsObject,
} from '../components/connectors/byomcp/citationPointerUtils';

function buildInitialDynamicTools(connector?: DataConnector): DynamicToolItem[] {
  if (!connector) return [];
  const enabledActions: string[] = connector.bapConfig?.enabledActions || [];
  const dynTools: DynamicToolItem[] = [];

  if (Array.isArray(connector.dynamicTools) && connector.dynamicTools.length > 0) {
    connector.dynamicTools.forEach(
      (t: {
        name: string;
        displayName?: string;
        description?: string;
        enabled?: boolean;
        inputSchema?: Record<string, unknown>;
        outputSchema?: Record<string, unknown>;
      }) => {
        const isEnabled =
          t.enabled !== undefined ? Boolean(t.enabled) : enabledActions.includes(t.name);
        dynTools.push({
          name: t.name,
          displayName: t.displayName || t.name,
          description: t.description || '',
          enabled: isEnabled,
          inputSchema: t.inputSchema,
          outputSchema: t.outputSchema,
        });
      }
    );
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
  return dynTools;
}

export function sanitizeByomcpActionParamsForPatch(
  rawActionParams: Record<string, unknown>
): Record<string, unknown> {
  const hasClientId =
    typeof rawActionParams.client_id === 'string' && rawActionParams.client_id.trim().length > 0;
  const hasClientSecret =
    typeof rawActionParams.client_secret === 'string' &&
    rawActionParams.client_secret.trim().length > 0;
  const isReauth = hasClientId || hasClientSecret;
  const isNoAuth = rawActionParams.auth_type === 'NO_AUTH';

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawActionParams)) {
    if (SYSTEM_MANAGED_ACTION_PARAM_KEYS.has(key)) {
      continue;
    }
    if (!isReauth && OAUTH_ACTION_PARAM_KEYS.has(key)) {
      if (isNoAuth && (key === 'auth_type' || key === 'instance_uri')) {
        sanitized[key] = value;
      }
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

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
  const [citationMappings, setCitationMappings] = useState<CitationMappingRuleItem[]>([]);
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
    setCitationMappings(parseCitationMappingsFromApi(actionParams.citation_mappings));

    // Custom action params
    const customList: CustomParamItem[] = [];
    Object.entries(actionParams).forEach(([k, v]) => {
      if (!KNOWN_ACTION_PARAM_KEYS.has(k)) {
        customList.push({ key: k, value: typeof v === 'object' ? JSON.stringify(v) : String(v) });
      }
    });
    setCustomActionParams(customList);

    // Dynamic Tools & Enabled Actions
    setDynamicTools(buildInitialDynamicTools(connector));

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
        if (parsed.bapConfig) {
          masks.add('bap_config');
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

    const origCitationRules = parseCitationMappingsFromApi(origActionParams.citation_mappings);
    const hadOrigCitationMappings = origCitationRules.length > 0;
    const serializedCurrentCitations = serializeCitationMappingsToApi(citationMappings);
    const serializedOrigCitations = serializeCitationMappingsToApi(origCitationRules);
    const citationMappingsChanged =
      JSON.stringify(serializedCurrentCitations) !== JSON.stringify(serializedOrigCitations);

    const descChanged = mcpServerDescription !== origDesc;
    const instChanged = mcpAgentInstructions !== origInst;
    const uriChanged = instanceUri.trim() !== origUri;
    const intervalChanged = refreshInterval !== origInterval;
    const staticIpChanged = staticIpEnabled !== origStaticIp;

    const origDynamicTools = buildInitialDynamicTools(connector);
    const origEnabledActions = origDynamicTools
      .filter((t) => t.enabled)
      .map((t) => t.name)
      .slice()
      .sort()
      .join(',');
    const currentEnabledActions = dynamicTools
      .filter((t) => t.enabled)
      .map((t) => t.name)
      .slice()
      .sort()
      .join(',');
    const toolsChanged =
      origEnabledActions !== currentEnabledActions ||
      dynamicTools.length !== origDynamicTools.length;

    const customChanged = customActionParams.some((item) => item.key.trim().length > 0);
    const authChanged = Boolean(clientId.trim()) || Boolean(clientSecret.trim());
    const noAuthUriChanged = authType === 'NO_AUTH' && uriChanged && Boolean(instanceUri.trim());

    // If no changes detected, default to updating action_params with current description & instructions
    const actionParamsChanged =
      descChanged ||
      instChanged ||
      citationMappingsChanged ||
      customChanged ||
      authChanged ||
      noAuthUriChanged;
    const hasAnyChange =
      actionParamsChanged || toolsChanged || intervalChanged || staticIpChanged;

    const masks: string[] = [];
    const payload: Record<string, unknown> = {};

    // 1. Action Params
    // IMPORTANT: On `custom_mcp` connectors, Discovery Engine's UpdateDataConnectorHandler
    // treats ANY presence of an OAuth parameter (`instance_uri`, `auth_uri`, `token_uri`,
    // `scopes`, `auth_uri_params`, `pkce_support_enabled`, `client_secret_basic_override`)
    // in `action_config.action_params` as a credential rotation (`should_update_auth_config = true`)
    // and invokes `GetDataConnectorAuthConfig`, which rejects the request with
    // `400 INVALID_ARGUMENT ("Request contains an invalid argument.")` unless both
    // `client_id` and `client_secret` are also supplied.
    // When not rotating credentials (`!authChanged`), `PersistCustomMcpConfig` on the backend
    // automatically preserves all stored OAuth and hidden fields (`auth_uri`, `token_uri`,
    // `scopes`, `auth_uri_params`, `mcp_server_source`, `registry_mcp_server_name`,
    // `credentials.instance_uri`). Therefore we only send view/edit action_params here.
    if (actionParamsChanged || !hasAnyChange) {
      masks.push('action_config.action_params');
      const actionParamsPayload: Record<string, unknown> = {};

      if (mcpServerDescription.trim()) {
        actionParamsPayload.mcp_server_description = mcpServerDescription.trim();
      } else if (descChanged) {
        actionParamsPayload.mcp_server_description = '';
      }

      if (mcpAgentInstructions.trim()) {
        actionParamsPayload.mcp_agent_instructions = mcpAgentInstructions.trim();
      } else if (instChanged) {
        actionParamsPayload.mcp_agent_instructions = '';
      }

      if (citationMappings.length > 0) {
        actionParamsPayload.citation_mappings = serializedCurrentCitations;
      } else if (hadOrigCitationMappings) {
        // Sending empty object {} removes all citation mappings per Discovery Engine v1 spec
        actionParamsPayload.citation_mappings = {};
      }

      if (authChanged) {
        if (clientId.trim()) actionParamsPayload.client_id = clientId.trim();
        if (clientSecret.trim()) actionParamsPayload.client_secret = clientSecret.trim();
        if (authType) actionParamsPayload.auth_type = authType;
        if (instanceUri.trim()) actionParamsPayload.instance_uri = instanceUri.trim();
        if (scopes.trim()) actionParamsPayload.scopes = scopes.trim();
        if (authUri.trim()) actionParamsPayload.auth_uri = authUri.trim();
        if (tokenUri.trim()) actionParamsPayload.token_uri = tokenUri.trim();
        if (authUriParams.trim()) {
          const trimmedParams = authUriParams.trim();
          actionParamsPayload.auth_uri_params = trimmedParams.startsWith('&')
            ? trimmedParams
            : `&${trimmedParams}`;
        }
        if (typeof origActionParams.pkce_support_enabled === 'boolean') {
          actionParamsPayload.pkce_support_enabled = origActionParams.pkce_support_enabled;
        }
        if (typeof origActionParams.client_secret_basic_override === 'boolean') {
          actionParamsPayload.client_secret_basic_override =
            origActionParams.client_secret_basic_override;
        }
      } else if (authType === 'NO_AUTH' && uriChanged && instanceUri.trim()) {
        actionParamsPayload.auth_type = 'NO_AUTH';
        actionParamsPayload.instance_uri = instanceUri.trim();
      }

      customActionParams.forEach((item) => {
        const k = item.key.trim();
        if (!k || SYSTEM_MANAGED_ACTION_PARAM_KEYS.has(k)) return;
        if (!authChanged && OAUTH_ACTION_PARAM_KEYS.has(k)) return;
        try {
          actionParamsPayload[k] = JSON.parse(item.value);
        } catch {
          actionParamsPayload[k] = item.value;
        }
      });

      payload.actionConfig = {
        actionParams: actionParamsPayload,
      };
    }

    // 2. Dynamic Tools (via bap_config.enabled_actions; dynamic_tools itself is OUTPUT_ONLY)
    if (toolsChanged) {
      masks.push('bap_config');
      payload.bapConfig = {
        enabledActions: dynamicTools.filter((t) => t.enabled).map((t) => t.name),
      };
    }

    // 3. Refresh Interval
    if (intervalChanged) {
      masks.push('refresh_interval');
      payload.refreshInterval = refreshInterval;
    }

    // 4. Static IP
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
    citationMappings,
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
    if (actionParams.citation_mappings !== undefined) {
      setCitationMappings(parseCitationMappingsFromApi(actionParams.citation_mappings));
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
      const newToolList: DynamicToolItem[] = tools.map((t: { name: string; description?: string; inputSchema?: Record<string, unknown>; outputSchema?: Record<string, unknown>; [key: string]: unknown }) => {
        const existing = existingMap.get(t.name);
        return {
          name: t.name,
          displayName: existing?.displayName || t.name,
          description: t.description || existing?.description || '',
          enabled: existing ? existing.enabled : true,
          inputSchema: (t.inputSchema as Record<string, unknown> | undefined) || existing?.inputSchema,
          outputSchema: (t.outputSchema as Record<string, unknown> | undefined) || existing?.outputSchema,
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

  // Probe a live MCP tool via tools/call to inspect its actual JSON response and discover citation pointers
  const handleProbeLiveTool = async (
    toolName: string,
    toolArgs: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>> => {
    const uri = instanceUri.trim();
    if (!uri) {
      throw new Error('No MCP instance URI configured. Enter an MCP server URL above first.');
    }
    const parts = (connector.name || '').split('/');
    const projId = parts[parts.indexOf('projects') + 1] || config.projectId;
    return await api.callMcpTool(projId, uri, toolName, toolArgs);
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

  // Citation mapping handlers
  const handleAddCitationMapping = (rule: CitationMappingRuleItem) => {
    setCitationMappings((prev) => [...prev, rule]);
  };

  const handleUpdateCitationMapping = (index: number, updated: CitationMappingRuleItem) => {
    setCitationMappings((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  };

  const handleRemoveCitationMapping = (index: number) => {
    setCitationMappings((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleClearAllCitationMappings = () => {
    setCitationMappings([]);
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

    if (editorMode === 'visual' && citationMappings.length > 0) {
      const citationErrors = validateCitationMappings(citationMappings).filter(
        (issue) => issue.severity === 'error'
      );
      if (citationErrors.length > 0) {
        setSaveError(`Invalid citation_mappings configuration: ${citationErrors[0].message}`);
        return;
      }
    }

    if (
      editorMode === 'visual' &&
      authType === 'OAUTH' &&
      (Boolean(clientId.trim()) || Boolean(clientSecret.trim())) &&
      (!clientId.trim() || !clientSecret.trim())
    ) {
      setSaveError(
        'Both Client ID and Client Secret are required when updating OAuth credentials.'
      );
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
        const parsedJson = JSON.parse(rawJsonText) as Record<string, unknown>;
        payloadToSend = { ...parsedJson };
        const rawActionConfig = payloadToSend.actionConfig as
          | { actionParams?: Record<string, unknown> }
          | undefined;
        const rawActionParams = rawActionConfig?.actionParams;
        const rawCitations = rawActionParams?.citation_mappings;
        if (rawCitations !== undefined) {
          const rawIssues = validateRawCitationMappingsObject(rawCitations).filter(
            (i) => i.severity === 'error'
          );
          if (rawIssues.length > 0) {
            setSaveError(`Invalid citation_mappings in JSON: ${rawIssues[0].message}`);
            setIsSaving(false);
            return;
          }
        }
        if (rawActionParams && typeof rawActionParams === 'object') {
          const hasClientId =
            typeof rawActionParams.client_id === 'string' &&
            rawActionParams.client_id.trim().length > 0;
          const hasClientSecret =
            typeof rawActionParams.client_secret === 'string' &&
            rawActionParams.client_secret.trim().length > 0;
          const rawAuthType =
            typeof rawActionParams.auth_type === 'string'
              ? rawActionParams.auth_type.trim()
              : authType;
          if (
            rawAuthType !== 'NO_AUTH' &&
            ('client_id' in rawActionParams || 'client_secret' in rawActionParams) &&
            (!hasClientId || !hasClientSecret)
          ) {
            setSaveError(
              'Both client_id and client_secret must be non-empty when re-authenticating OAuth in JSON mode.'
            );
            setIsSaving(false);
            return;
          }
          payloadToSend.actionConfig = {
            ...rawActionConfig,
            actionParams: sanitizeByomcpActionParamsForPatch(rawActionParams),
          };
        }
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
    citationMappings,
    setCitationMappings,
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
    handleProbeLiveTool,
    handleApplyPreset,
    handleToggleTool,
    handleToggleAllTools,
    handleAddCitationMapping,
    handleUpdateCitationMapping,
    handleRemoveCitationMapping,
    handleClearAllCitationMappings,
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
