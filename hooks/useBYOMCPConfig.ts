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

import { useState, useEffect, useMemo, useCallback } from 'react';
import * as api from '../services/apiService';
import { Config, DataConnector } from '../types';
import { toErrorMessage } from '../utils/errors';
import {
  DynamicToolItem,
  McpToolAnnotations,
  CustomParamItem,
  InstructionPreset,
  CitationMappingRuleItem,
  KNOWN_ACTION_PARAM_KEYS,
  OAUTH_ACTION_PARAM_KEYS,
  SYSTEM_MANAGED_ACTION_PARAM_KEYS,
  registerByomcpAuthBridge,
  registerByomcpAdvancedBridge,
} from '../components/connectors/byomcp/types';
import {
  parseCitationMappingsFromApi,
  serializeCitationMappingsToApi,
  validateCitationMappings,
  validateRawCitationMappingsObject,
} from '../components/connectors/byomcp/citationPointerUtils';

function normalizeToolAnnotations(raw: unknown): McpToolAnnotations | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const rec = raw as Record<string, unknown>;
  const annotations: McpToolAnnotations = {};
  if (typeof rec.title === 'string' && rec.title.trim()) annotations.title = rec.title.trim();
  if (typeof rec.readOnlyHint === 'boolean') annotations.readOnlyHint = rec.readOnlyHint;
  else if (typeof rec.read_only_hint === 'boolean') annotations.readOnlyHint = rec.read_only_hint;
  if (typeof rec.destructiveHint === 'boolean') annotations.destructiveHint = rec.destructiveHint;
  else if (typeof rec.destructive_hint === 'boolean')
    annotations.destructiveHint = rec.destructive_hint;
  if (typeof rec.idempotentHint === 'boolean') annotations.idempotentHint = rec.idempotentHint;
  else if (typeof rec.idempotent_hint === 'boolean')
    annotations.idempotentHint = rec.idempotent_hint;
  if (typeof rec.openWorldHint === 'boolean') annotations.openWorldHint = rec.openWorldHint;
  else if (typeof rec.open_world_hint === 'boolean')
    annotations.openWorldHint = rec.open_world_hint;
  return Object.keys(annotations).length > 0 ? annotations : undefined;
}

function parseEgressFqdnList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => String(item || '').trim())
      .filter((item) => item.length > 0);
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  return [];
}

function buildInitialDynamicTools(connector?: DataConnector): DynamicToolItem[] {
  if (!connector) return [];
  const enabledActions: string[] = connector.bapConfig?.enabledActions || [];
  const dynTools: DynamicToolItem[] = [];

  const connectorAny = connector as DataConnector & {
    connectorTools?: Array<Record<string, unknown>>;
  };
  const rawConnectorTools = Array.isArray(connectorAny.connectorTools)
    ? connectorAny.connectorTools
    : Array.isArray(
        (connector.actionConfig as Record<string, unknown> | undefined)?.connectorTools
      )
    ? ((connector.actionConfig as Record<string, unknown>).connectorTools as Array<
        Record<string, unknown>
      >)
    : [];

  const connectorToolsByName = new Map<
    string,
    {
      annotations?: McpToolAnnotations;
      hitlMode?: string;
      displayName?: string;
      description?: string;
      enabled?: boolean;
    }
  >();
  rawConnectorTools.forEach((ct) => {
    const toolName = typeof ct?.name === 'string' ? ct.name : '';
    if (!toolName) return;
    const directAnnotations =
      normalizeToolAnnotations(ct.annotations) || normalizeToolAnnotations(ct);
    const hitlMode =
      typeof ct.hitlMode === 'string' && ct.hitlMode.trim()
        ? ct.hitlMode.trim()
        : typeof ct.hitl_mode === 'string' && ct.hitl_mode.trim()
        ? (ct.hitl_mode as string).trim()
        : undefined;
    connectorToolsByName.set(toolName, {
      annotations: directAnnotations,
      hitlMode,
      displayName:
        (typeof ct.displayName === 'string' && ct.displayName) ||
        directAnnotations?.title ||
        undefined,
      description: typeof ct.description === 'string' ? ct.description : undefined,
      enabled: typeof ct.enabled === 'boolean' ? ct.enabled : undefined,
    });
  });

  const rawTools =
    Array.isArray(connector.dynamicTools) && connector.dynamicTools.length > 0
      ? connector.dynamicTools
      : Array.isArray(connector.actionConfig?.dynamicTools)
      ? connector.actionConfig.dynamicTools
      : [];

  if (rawTools.length > 0) {
    rawTools.forEach(
      (t: {
        name: string;
        displayName?: string;
        description?: string;
        enabled?: boolean;
        inputSchema?: Record<string, unknown>;
        outputSchema?: Record<string, unknown>;
        annotations?: unknown;
        hitlMode?: string;
      }) => {
        const meta = connectorToolsByName.get(t.name);
        const isEnabled =
          t.enabled !== undefined
            ? Boolean(t.enabled)
            : meta?.enabled !== undefined
            ? meta.enabled
            : enabledActions.includes(t.name);
        const mergedAnnotations =
          meta?.annotations || normalizeToolAnnotations(t.annotations);
        const mergedHitl =
          meta?.hitlMode ||
          (typeof t.hitlMode === 'string' && t.hitlMode.trim() ? t.hitlMode.trim() : undefined);
        dynTools.push({
          name: t.name,
          displayName: t.displayName || meta?.displayName || t.name,
          description: t.description || meta?.description || '',
          enabled: isEnabled,
          inputSchema: t.inputSchema,
          outputSchema: t.outputSchema,
          ...(mergedAnnotations ? { annotations: mergedAnnotations } : {}),
          ...(mergedHitl ? { hitlMode: mergedHitl } : {}),
        });
      }
    );
  } else if (rawConnectorTools.length > 0) {
    rawConnectorTools.forEach((ct) => {
      const toolName = typeof ct?.name === 'string' ? ct.name : '';
      if (!toolName) return;
      const meta = connectorToolsByName.get(toolName);
      const isEnabled =
        meta?.enabled !== undefined
          ? meta.enabled
          : enabledActions.length > 0
          ? enabledActions.includes(toolName)
          : true;
      dynTools.push({
        name: toolName,
        displayName: meta?.displayName || toolName,
        description: meta?.description || '',
        enabled: isEnabled,
        ...(meta?.annotations ? { annotations: meta.annotations } : {}),
        ...(meta?.hitlMode ? { hitlMode: meta.hitlMode } : {}),
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
  const [pkceSupportEnabled, setPkceSupportEnabled] = useState<boolean>(false);
  const [clientSecretBasicOverride, setClientSecretBasicOverride] = useState<boolean>(false);
  const [mcpServerSource, setMcpServerSource] = useState<string>('BYO_MCP');
  const [registryMcpServerName, setRegistryMcpServerName] = useState<string>('');
  const [citationMappings, setCitationMappings] = useState<CitationMappingRuleItem[]>([]);
  const [customActionParams, setCustomActionParams] = useState<CustomParamItem[]>([]);

  // VPC / Private Connectivity (Agent Gateway & Service Directory VPC-SC)
  const [useAgentGatewayEgress, setUseAgentGatewayEgress] = useState<boolean>(false);
  const [agentGatewayEngine, setAgentGatewayEngine] = useState<string>('');
  const [egressFqdns, setEgressFqdns] = useState<string>('');
  const [serviceDirectoryServiceName, setServiceDirectoryServiceName] = useState<string>('');

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
    setPkceSupportEnabled(Boolean(actionParams.pkce_support_enabled));
    setClientSecretBasicOverride(Boolean(actionParams.client_secret_basic_override));
    setMcpServerSource(mSource);
    setRegistryMcpServerName(regName);
    setCitationMappings(parseCitationMappingsFromApi(actionParams.citation_mappings));

    setUseAgentGatewayEgress(Boolean(actionParams.use_agent_gateway_egress));
    setAgentGatewayEngine(
      typeof actionParams.agent_gateway_engine === 'string'
        ? actionParams.agent_gateway_engine
        : ''
    );
    setEgressFqdns(parseEgressFqdnList(actionParams.egress_fqdns).join(', '));
    const rawServiceName = connector.actionConfig?.serviceName || '';
    setServiceDirectoryServiceName(rawServiceName.startsWith('projects/') ? rawServiceName : '');

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
        const actionConfig = parsed.actionConfig as {
          actionParams?: Record<string, unknown>;
          serviceName?: string;
        } | undefined;
        if (actionConfig?.actionParams && Object.keys(actionConfig.actionParams).length > 0) {
          masks.add('action_config.action_params');
        }
        if (actionConfig?.serviceName !== undefined) {
          masks.add('action_config.service_name');
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
    const origPkce = Boolean(origActionParams.pkce_support_enabled);
    const origBasicOverride = Boolean(origActionParams.client_secret_basic_override);
    const pkceChanged = pkceSupportEnabled !== origPkce;
    const basicOverrideChanged = clientSecretBasicOverride !== origBasicOverride;

    const origUseGateway = Boolean(origActionParams.use_agent_gateway_egress);
    const origGatewayEngine =
      typeof origActionParams.agent_gateway_engine === 'string'
        ? origActionParams.agent_gateway_engine.trim()
        : '';
    const origEgressFqdns = parseEgressFqdnList(origActionParams.egress_fqdns);
    const currentEgressFqdns = parseEgressFqdnList(egressFqdns);
    const vpcParamsChanged =
      useAgentGatewayEgress !== origUseGateway ||
      agentGatewayEngine.trim() !== origGatewayEngine ||
      JSON.stringify(currentEgressFqdns) !== JSON.stringify(origEgressFqdns);

    const rawOrigServiceName = connector?.actionConfig?.serviceName || '';
    const origServiceDirName = rawOrigServiceName.startsWith('projects/')
      ? rawOrigServiceName.trim()
      : '';
    const serviceNameChanged = serviceDirectoryServiceName.trim() !== origServiceDirName;

    const authChanged = Boolean(clientId.trim()) || Boolean(clientSecret.trim());
    const noAuthUriChanged = authType === 'NO_AUTH' && uriChanged && Boolean(instanceUri.trim());

    // If no changes detected, default to updating action_params with current description & instructions
    const actionParamsChanged =
      descChanged ||
      instChanged ||
      citationMappingsChanged ||
      customChanged ||
      vpcParamsChanged ||
      authChanged ||
      pkceChanged ||
      basicOverrideChanged ||
      noAuthUriChanged;
    const hasAnyChange =
      actionParamsChanged ||
      serviceNameChanged ||
      toolsChanged ||
      intervalChanged ||
      staticIpChanged;

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
        if (
          pkceSupportEnabled ||
          pkceChanged ||
          typeof origActionParams.pkce_support_enabled === 'boolean'
        ) {
          actionParamsPayload.pkce_support_enabled = pkceSupportEnabled;
        }
        if (
          clientSecretBasicOverride ||
          basicOverrideChanged ||
          typeof origActionParams.client_secret_basic_override === 'boolean'
        ) {
          actionParamsPayload.client_secret_basic_override = clientSecretBasicOverride;
        }
      } else if (authType === 'NO_AUTH' && uriChanged && instanceUri.trim()) {
        actionParamsPayload.auth_type = 'NO_AUTH';
        actionParamsPayload.instance_uri = instanceUri.trim();
      }

      if (vpcParamsChanged) {
        actionParamsPayload.use_agent_gateway_egress = useAgentGatewayEgress;
        if (agentGatewayEngine.trim() || origGatewayEngine) {
          actionParamsPayload.agent_gateway_engine = agentGatewayEngine.trim();
        }
        if (currentEgressFqdns.length > 0 || origEgressFqdns.length > 0) {
          actionParamsPayload.egress_fqdns = currentEgressFqdns;
        }
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

    // 1b. Service Directory VPC-SC Private Connectivity (actionConfig.serviceName)
    if (serviceNameChanged) {
      masks.push('action_config.service_name');
      payload.actionConfig = {
        ...((payload.actionConfig as Record<string, unknown> | undefined) || {}),
        serviceName: serviceDirectoryServiceName.trim(),
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
    pkceSupportEnabled,
    clientSecretBasicOverride,
    useAgentGatewayEgress,
    agentGatewayEngine,
    egressFqdns,
    serviceDirectoryServiceName,
    authType,
    scopes,
    authUri,
    tokenUri,
    authUriParams,
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
    if (actionParams.pkce_support_enabled !== undefined) {
      setPkceSupportEnabled(Boolean(actionParams.pkce_support_enabled));
    }
    if (actionParams.client_secret_basic_override !== undefined) {
      setClientSecretBasicOverride(Boolean(actionParams.client_secret_basic_override));
    }
    if (actionParams.use_agent_gateway_egress !== undefined) {
      setUseAgentGatewayEgress(Boolean(actionParams.use_agent_gateway_egress));
    }
    if (actionParams.agent_gateway_engine !== undefined) {
      setAgentGatewayEngine(String(actionParams.agent_gateway_engine));
    }
    if (actionParams.egress_fqdns !== undefined) {
      setEgressFqdns(parseEgressFqdnList(actionParams.egress_fqdns).join(', '));
    }
    if ((actionConfig as { serviceName?: string } | undefined)?.serviceName !== undefined) {
      setServiceDirectoryServiceName(
        String((actionConfig as { serviceName?: string }).serviceName || '')
      );
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
      const newToolList: DynamicToolItem[] = tools.map((t: { name: string; description?: string; inputSchema?: Record<string, unknown>; outputSchema?: Record<string, unknown>; annotations?: unknown; hitlMode?: string; [key: string]: unknown }) => {
        const existing = existingMap.get(t.name);
        const annotations = normalizeToolAnnotations(t.annotations) || existing?.annotations;
        const hitlMode =
          (typeof t.hitlMode === 'string' && t.hitlMode.trim()) || existing?.hitlMode;
        return {
          name: t.name,
          displayName: existing?.displayName || annotations?.title || t.name,
          description: t.description || existing?.description || '',
          enabled: existing ? existing.enabled : true,
          inputSchema: (t.inputSchema as Record<string, unknown> | undefined) || existing?.inputSchema,
          outputSchema: (t.outputSchema as Record<string, unknown> | undefined) || existing?.outputSchema,
          ...(annotations ? { annotations } : {}),
          ...(hitlMode ? { hitlMode } : {}),
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
  const handleAddCustomParam = useCallback(() => {
    setCustomActionParams((prev) => [...prev, { key: '', value: '' }]);
  }, []);

  const handleSetAuthType = useCallback((val: string) => {
    setAuthType(val);
  }, []);

  const handleSetShowAdvancedAuth = useCallback((val: boolean) => {
    setShowAdvancedAuth(val);
  }, []);

  const handleSetRefreshInterval = useCallback((val: string) => {
    setRefreshInterval(val);
  }, []);

  const handleSetStaticIpEnabled = useCallback((val: boolean) => {
    setStaticIpEnabled(val);
  }, []);

  registerByomcpAuthBridge([handleSetAuthType, handleSetShowAdvancedAuth], {
    pkceSupportEnabled,
    setPkceSupportEnabled,
    clientSecretBasicOverride,
    setClientSecretBasicOverride,
  });

  registerByomcpAdvancedBridge(
    [handleSetRefreshInterval, handleSetStaticIpEnabled, handleAddCustomParam],
    {
      useAgentGatewayEgress,
      setUseAgentGatewayEgress,
      agentGatewayEngine,
      setAgentGatewayEngine,
      egressFqdns,
      setEgressFqdns,
      serviceDirectoryServiceName,
      setServiceDirectoryServiceName,
    }
  );

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

    const origActionParamsForCheck = connector?.actionConfig?.actionParams || {};
    const pkceWasModified =
      pkceSupportEnabled !== Boolean(origActionParamsForCheck.pkce_support_enabled);
    const basicOverrideWasModified =
      clientSecretBasicOverride !== Boolean(origActionParamsForCheck.client_secret_basic_override);

    if (
      editorMode === 'visual' &&
      authType === 'OAUTH' &&
      (Boolean(clientId.trim()) ||
        Boolean(clientSecret.trim()) ||
        pkceWasModified ||
        basicOverrideWasModified) &&
      (!clientId.trim() || !clientSecret.trim())
    ) {
      setSaveError(
        'Both Client ID and Client Secret are required when updating OAuth credentials or PKCE settings.'
      );
      return;
    }

    if (editorMode === 'visual') {
      const trimmedServiceDir = serviceDirectoryServiceName.trim();
      if (
        trimmedServiceDir &&
        !/^projects\/[^/\s]+\/locations\/[^/\s]+\/namespaces\/[^/\s]+\/services\/[^/\s]+$/.test(
          trimmedServiceDir
        )
      ) {
        setSaveError(
          'Invalid Service Directory serviceName: expected projects/{project}/locations/{location}/namespaces/{namespace}/services/{service}.'
        );
        return;
      }

      const fqdnCandidates = parseEgressFqdnList(egressFqdns);
      const invalidFqdn = fqdnCandidates.find(
        (fqdn) =>
          fqdn.includes('://') ||
          fqdn.includes('/') ||
          !/^(?:\*\.)?[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(
            fqdn
          )
      );
      if (invalidFqdn) {
        setSaveError(
          `Invalid egress FQDN "${invalidFqdn}": enter bare domain hostnames (e.g. mcp.internal.example.com) without URL scheme or path.`
        );
        return;
      }
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
    setAuthType: handleSetAuthType,
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
    pkceSupportEnabled,
    setPkceSupportEnabled,
    clientSecretBasicOverride,
    setClientSecretBasicOverride,
    mcpServerSource,
    setMcpServerSource,
    registryMcpServerName,
    setRegistryMcpServerName,
    citationMappings,
    setCitationMappings,
    customActionParams,
    useAgentGatewayEgress,
    setUseAgentGatewayEgress,
    agentGatewayEngine,
    setAgentGatewayEngine,
    egressFqdns,
    setEgressFqdns,
    serviceDirectoryServiceName,
    setServiceDirectoryServiceName,
    dynamicTools,
    isRefreshingTools,
    refreshToolsError,
    refreshToolsSuccess,
    refreshInterval,
    setRefreshInterval: handleSetRefreshInterval,
    staticIpEnabled,
    setStaticIpEnabled: handleSetStaticIpEnabled,
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
    setShowAdvancedAuth: handleSetShowAdvancedAuth,
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
