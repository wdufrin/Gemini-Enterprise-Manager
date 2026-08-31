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
import * as api from '../../services/apiService';
import { Config } from '../../types';

interface DynamicToolItem {
  name: string;
  displayName?: string;
  description?: string;
  enabled: boolean;
}

interface CustomParamItem {
  key: string;
  value: string;
}

interface BYOMCPConfigTabProps {
  connector: any;
  config: Config;
  onConnectorUpdated?: (updatedConnector: any) => void;
  onRefreshSuccess?: () => void;
}

const INSTRUCTION_PRESETS = [
  {
    name: 'Enterprise Search',
    description: 'Executive summary, grouped results by source system, citations & quotes',
    instructions: `FORMATTING INSTRUCTIONS FOR SEARCH RESULTS:
1. When presenting retrieved information, always provide a concise executive summary first.
2. Group results by source system (e.g., Google Docs, Slack, Jira, Confluence).
3. For each item, include: [Document Title](URL), Author, and Last Modified Date.
4. Use blockquotes for exact quotes or excerpts from the source documents.
5. If multiple sources contain conflicting information, highlight the discrepancies.`,
    serverDescription: 'Enterprise search server to search across company docs, tickets, and communications.',
  },
  {
    name: 'Database / SQL Query Server',
    description: 'Schema verification, markdown tables, result limits, and trend insights',
    instructions: `FORMATTING INSTRUCTIONS FOR DATABASE QUERY RESULTS:
1. Inspect the database schema and verify table/column names before executing queries.
2. Limit query results to 50 rows unless explicitly requested by the user.
3. Present tabular data in clean markdown tables with aligned columns.
4. Provide a brief analytical commentary highlighting key numbers, trends, or outliers.
5. Never execute destructive DDL/DML statements (DROP, DELETE, TRUNCATE) without confirmation.`,
    serverDescription: 'MCP database server for inspecting schemas and executing analytical queries.',
  },
  {
    name: 'Issue Tracker & Project Management',
    description: 'Issue hierarchy, assignee details, status badges, and action items',
    instructions: `FORMATTING INSTRUCTIONS FOR PROJECT / ISSUE MANAGEMENT:
1. Clearly display Issue Key, Summary, Status, Priority, and Assignee.
2. Group tickets by project or epic hierarchy where applicable.
3. Highlight blocking issues or overdue items with explicit warning callouts.
4. Include clickable direct links to the issue tracking system.`,
    serverDescription: 'MCP issue tracker server for searching and managing project tasks and bugs.',
  },
  {
    name: 'General Enterprise Knowledge Server',
    description: 'General purpose tool output formatting with citations and source linking',
    instructions: `FORMATTING INSTRUCTIONS FOR MCP TOOLS:
1. Clearly identify which MCP tool was invoked to retrieve the information.
2. Present results objectively with concise summaries and source citations.
3. Provide direct reference links to documents or entities when available.
4. If an error or empty result occurs, provide a helpful diagnostic explanation.`,
    serverDescription: 'Custom MCP server for enterprise search and workflow integration.',
  },
];

const KNOWN_ACTION_PARAM_KEYS = new Set([
  'mcp_server_description',
  'mcp_agent_instructions',
  'instance_uri',
  'auth_type',
  'scopes',
  'auth_uri',
  'token_uri',
  'auth_uri_params',
  'client_id',
  'client_secret',
  'mcp_server_source',
  'registry_mcp_server_name',
]);

const BYOMCPConfigTab: React.FC<BYOMCPConfigTabProps> = ({
  connector,
  config,
  onConnectorUpdated,
  onRefreshSuccess,
}) => {
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
      connector.dynamicTools.forEach((t: any) => {
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

  // Construct current state as payload
  const currentPayload = useMemo(() => {
    const actionParamsPayload: Record<string, any> = {};

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

    // Discovery Engine OAuth rule:
    // If auth_type: OAUTH or OAuth endpoints/scopes are sent in actionParams, Discovery Engine requires client_id.
    // Since Google Cloud redacts client_id and secret on GET, only send OAuth fields if the user provided client_id
    // or if auth_type is non-OAuth (e.g. NONE, API_KEY). This allows updating descriptions, instructions, and tools
    // without wiping out or failing stored OAuth credentials.
    const hasClientId = Boolean(clientId.trim());
    if (hasClientId) {
      actionParamsPayload.client_id = clientId.trim();
      if (clientSecret.trim()) {
        actionParamsPayload.client_secret = clientSecret.trim();
      }
      if (authType) {
        actionParamsPayload.auth_type = authType;
      }
      if (scopes.trim()) {
        actionParamsPayload.scopes = scopes.trim();
      }
      if (authUri.trim()) {
        actionParamsPayload.auth_uri = authUri.trim();
      }
      if (tokenUri.trim()) {
        actionParamsPayload.token_uri = tokenUri.trim();
      }
      if (authUriParams.trim()) {
        actionParamsPayload.auth_uri_params = authUriParams.trim();
      }
      if (instanceUri.trim()) {
        actionParamsPayload.instance_uri = instanceUri.trim();
      }
    } else if (authType && authType !== 'OAUTH') {
      actionParamsPayload.auth_type = authType;
      if (instanceUri.trim()) {
        actionParamsPayload.instance_uri = instanceUri.trim();
      }
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

    const enabledToolNames = dynamicTools.filter((t) => t.enabled).map((t) => t.name);

    return {
      actionConfig: {
        ...(connector?.actionConfig || {}),
        actionParams: actionParamsPayload,
        createBapConnection: connector?.actionConfig?.createBapConnection ?? true,
      },
      params: {
        ...(connector?.params || {}),
        ...(instanceUri.trim() ? { instance_uri: instanceUri.trim() } : {}),
      },
      dynamicTools: dynamicTools.map((t) => ({
        name: t.name,
        displayName: t.displayName || t.name,
        description: t.description || '',
        enabled: t.enabled,
      })),
      bapConfig: {
        ...(connector?.bapConfig || {}),
        enabledActions: enabledToolNames,
      },
      refreshInterval: refreshInterval || '86400s',
      staticIpEnabled: staticIpEnabled,
    };
  }, [
    mcpServerDescription,
    mcpAgentInstructions,
    instanceUri,
    authType,
    scopes,
    authUri,
    tokenUri,
    authUriParams,
    clientId,
    clientSecret,
    mcpServerSource,
    registryMcpServerName,
    customActionParams,
    dynamicTools,
    refreshInterval,
    staticIpEnabled,
    connector,
  ]);

  // Sync to JSON mode text when switching or when payload updates
  useEffect(() => {
    if (editorMode === 'json' && !rawJsonText) {
      setRawJsonText(JSON.stringify(currentPayload, null, 2));
      setRawJsonError(null);
    }
  }, [editorMode, currentPayload, rawJsonText]);

  // Handle switching editor mode
  const handleSwitchMode = (mode: 'visual' | 'json') => {
    if (mode === 'json') {
      setRawJsonText(JSON.stringify(currentPayload, null, 2));
      setRawJsonError(null);
    } else {
      if (rawJsonText && !rawJsonError) {
        try {
          const parsed = JSON.parse(rawJsonText);
          applyParsedJsonToForm(parsed);
        } catch (e: any) {
          setRawJsonError(`Invalid JSON: ${e.message}`);
          return;
        }
      }
    }
    setEditorMode(mode);
  };

  // Helper to parse raw JSON and update form states
  const applyParsedJsonToForm = (parsed: any) => {
    const actionParams = parsed.actionConfig?.actionParams || parsed.actionParams || {};
    const params = parsed.params || {};

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
        parsed.dynamicTools.map((t: any) => ({
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
      const parts = connector.name.split('/');
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
    } catch (e: any) {
      setConnectivityResult({ status: 'fail', message: `Connectivity failed: ${e.message || 'Error reaching server.'}` });
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
      const parts = connector.name.split('/');
      const projId = parts[parts.indexOf('projects') + 1] || config.projectId;
      const tools = await api.listMcpTools(projId, uri);

      if (!tools || tools.length === 0) {
        throw new Error('No tools returned by the MCP server at the specified URI.');
      }

      // Merge with existing enabled states if tool name matches
      const existingMap = new Map(dynamicTools.map((t) => [t.name, t]));
      const newToolList: DynamicToolItem[] = tools.map((t: any) => {
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
    } catch (err: any) {
      console.error('Failed to fetch tools from MCP:', err);
      setRefreshToolsError(err.message || 'Failed to fetch tools.');
    } finally {
      setIsRefreshingTools(false);
    }
  };

  // Apply a template preset
  const handleApplyPreset = (preset: (typeof INSTRUCTION_PRESETS)[0]) => {
    setMcpAgentInstructions(preset.instructions);
    if (!mcpServerDescription.trim() || mcpServerDescription === 'testmcp') {
      setMcpServerDescription(preset.serverDescription);
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

  // Determine update mask automatically
  const computedUpdateMask = useMemo<string[]>(() => {
    if (editorMode === 'json' && !useAutoUpdateMask && customUpdateMask.trim()) {
      return customUpdateMask.split(',').map((s) => s.trim()).filter(Boolean);
    }

    const masks = new Set<string>();

    if (editorMode === 'json' && rawJsonText) {
      try {
        const parsed = JSON.parse(rawJsonText);
        if (parsed.actionConfig?.actionParams && Object.keys(parsed.actionConfig.actionParams).length > 0) {
          masks.add('action_config.action_params');
        }
        if (parsed.dynamicTools && parsed.dynamicTools.length > 0) {
          masks.add('dynamic_tools');
        }
        if (parsed.bapConfig) {
          masks.add('bap_config');
        }
        if (parsed.params?.instance_uri !== undefined) {
          masks.add('params.instance_uri');
        }
        if (parsed.refreshInterval !== undefined) {
          masks.add('refresh_interval');
        }
        if (parsed.staticIpEnabled !== undefined) {
          masks.add('static_ip_enabled');
        }
      } catch {
        masks.add('action_config.action_params');
      }
      return masks.size > 0 ? Array.from(masks) : ['action_config.action_params'];
    }

    // Visual Form Mode:
    if (Object.keys(currentPayload.actionConfig?.actionParams || {}).length > 0) {
      masks.add('action_config.action_params');
    }

    if (dynamicTools.length > 0) {
      masks.add('dynamic_tools');
      masks.add('bap_config');
    }

    if (instanceUri.trim()) {
      masks.add('params.instance_uri');
    }

    if (refreshInterval) {
      masks.add('refresh_interval');
    }

    masks.add('static_ip_enabled');

    return Array.from(masks);
  }, [editorMode, useAutoUpdateMask, customUpdateMask, rawJsonText, currentPayload, dynamicTools, instanceUri, refreshInterval]);

  // Construct cURL string
  const generatedCurl = useMemo<string>(() => {
    if (!connector || !connector.name) return '';
    const parts = connector.name.split('/');
    const projId = parts[parts.indexOf('projects') + 1] || config.projectId;
    const loc = parts[parts.indexOf('locations') + 1] || config.appLocation || 'global';
    const collId = parts[parts.indexOf('collections') + 1] || config.collectionId || 'default_collection';
    const host = loc === 'global' ? 'discoveryengine.googleapis.com' : `${loc}-discoveryengine.googleapis.com`;

    const maskStr = computedUpdateMask.join(',');

    let payloadToPrint: any = {};
    if (editorMode === 'json' && rawJsonText && !rawJsonError) {
      try {
        payloadToPrint = JSON.parse(rawJsonText);
      } catch {
        payloadToPrint = currentPayload;
      }
    } else {
      payloadToPrint = currentPayload;
    }

    return `curl -X PATCH \\
  -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \\
  -H "Content-Type: application/json" \\
  -H "x-goog-user-project: ${projId}" \\
  "https://${host}/v1alpha/projects/${projId}/locations/${loc}/collections/${collId}/dataConnector?updateMask=${maskStr}" \\
  -d '${JSON.stringify(payloadToPrint, null, 2).replace(/'/g, "'\\''")}'`;
  }, [connector, config, computedUpdateMask, editorMode, rawJsonText, rawJsonError, currentPayload]);

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
        : JSON.stringify(currentPayload, null, 2);
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
    } catch (e: any) {
      setRawJsonError(`Cannot beautify: ${e.message}`);
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

      let payloadToSend: any = {};
      if (editorMode === 'json' && rawJsonText) {
        payloadToSend = JSON.parse(rawJsonText);
      } else {
        payloadToSend = currentPayload;
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
    } catch (err: any) {
      console.error('Failed to update BYOMCP data connector:', err);
      setSaveError(err.message || 'Failed to update BYOMCP data connector settings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn text-gray-200">
      {/* Top Header & Mode Switcher */}
      <div className="bg-gray-900/80 p-4 rounded-lg border border-gray-700/80 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              BYOMCP Connector Settings & Configuration
            </h3>
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-950 text-purple-300 border border-purple-800">
              BYO_MCP
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Configure Model Context Protocol (MCP) server descriptions, agent formatting instructions, authentication, dynamic tools, and sync intervals.
          </p>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center bg-gray-950 p-1 rounded-lg border border-gray-800 shrink-0">
          <button
            onClick={() => handleSwitchMode('visual')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
              editorMode === 'visual'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            Visual Form
          </button>
          <button
            onClick={() => handleSwitchMode('json')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
              editorMode === 'json'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <svg className="w-3.5 h-3.5 font-mono" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            Raw JSON Editor
          </button>
        </div>
      </div>

      {/* Notifications */}
      {saveSuccess && (
        <div className="p-3 bg-green-950/40 border border-green-800 text-green-300 rounded-lg text-xs flex items-center gap-2 animate-fadeIn">
          <svg className="w-4 h-4 shrink-0 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          BYOMCP settings successfully updated in Discovery Engine!
        </div>
      )}

      {saveError && (
        <div className="p-3 bg-red-950/40 border border-red-800 text-red-300 rounded-lg text-xs flex items-start gap-2 animate-fadeIn">
          <svg className="w-4 h-4 shrink-0 text-red-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <div className="font-semibold">Failed to save settings:</div>
            <div className="mt-0.5">{saveError}</div>
          </div>
        </div>
      )}

      {/* VISUAL FORM MODE */}
      {editorMode === 'visual' ? (
        <div className="space-y-6">
          {/* Section 1: Server Description & Agent Instructions */}
          <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800 space-y-4">
            <div className="flex justify-between items-center border-b border-gray-800 pb-2">
              <div>
                <h4 className="text-sm font-bold text-gray-200 uppercase tracking-wider">
                  MCP Agent & Formatting Guidelines
                </h4>
                <p className="text-xs text-gray-400">
                  Defines the purpose of this server and formatting rules provided to the AI agent.
                </p>
              </div>

              {/* Presets dropdown */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 font-medium hidden sm:inline">Templates:</span>
                <div className="flex flex-wrap gap-1.5">
                  {INSTRUCTION_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleApplyPreset(preset)}
                      title={preset.description}
                      className="px-2.5 py-1 text-[11px] font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded border border-gray-700 transition-colors"
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Server Description */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                MCP Server Description <span className="text-purple-400 font-mono text-[10px]">(mcp_server_description)</span>
              </label>
              <input
                type="text"
                value={mcpServerDescription}
                onChange={(e) => setMcpServerDescription(e.target.value)}
                placeholder="e.g. Enterprise search server to search across company docs, tickets, and communications."
                className="w-full bg-gray-950 border border-gray-700 rounded p-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                High-level description of what the MCP server searches or performs. Used by agent orchestrators for query routing.
              </p>
            </div>

            {/* Agent Instructions */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-semibold text-gray-300">
                  Agent Formatting & Behavioral Instructions <span className="text-purple-400 font-mono text-[10px]">(mcp_agent_instructions)</span>
                </label>
                <button
                  onClick={() => setMcpAgentInstructions('')}
                  className="text-[10px] text-gray-500 hover:text-red-400 transition-colors"
                >
                  Clear
                </button>
              </div>
              <textarea
                value={mcpAgentInstructions}
                onChange={(e) => setMcpAgentInstructions(e.target.value)}
                rows={8}
                placeholder="FORMATTING INSTRUCTIONS FOR SEARCH RESULTS:&#10;1. Always provide a concise executive summary first.&#10;2. Group results by source system (e.g., Google Docs, Slack, Jira, Confluence).&#10;3. Include [Title](URL), Author, and Date."
                className="w-full bg-gray-950 border border-gray-700 rounded p-3 text-xs text-white font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500 leading-relaxed custom-scrollbar"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Multi-line system prompt given to Gemini when executing actions or summarizing retrieved data from this MCP server.
              </p>
            </div>
          </div>

          {/* Section 2: Endpoint URI & Dynamic Tools */}
          <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800 space-y-4">
            <div className="border-b border-gray-800 pb-2 flex justify-between items-center">
              <div>
                <h4 className="text-sm font-bold text-gray-200 uppercase tracking-wider">
                  MCP Server Endpoint & Discovered Tools
                </h4>
                <p className="text-xs text-gray-400">
                  Configure server URL and toggle individual tools to enable or disable actions.
                </p>
              </div>
            </div>

            {/* Instance URI */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                MCP Instance URI <span className="text-purple-400 font-mono text-[10px]">(instance_uri)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={instanceUri}
                  onChange={(e) => setInstanceUri(e.target.value)}
                  placeholder="https://oracle-mcp-server-180054373655.us-central1.run.app/mcp"
                  className="flex-1 bg-gray-950 border border-gray-700 rounded p-2.5 text-xs text-white font-mono placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleTestConnectivity}
                  disabled={isTestingConnectivity || !instanceUri.trim()}
                  className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold rounded border border-gray-700 disabled:opacity-50 transition-colors flex items-center gap-1.5 shrink-0"
                >
                  {isTestingConnectivity ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-blue-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      Testing...
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      Test Connectivity
                    </>
                  )}
                </button>
                <button
                  onClick={handleRefreshToolsFromEndpoint}
                  disabled={isRefreshingTools || !instanceUri.trim()}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded disabled:opacity-50 transition-colors flex items-center gap-1.5 shrink-0 shadow-sm"
                >
                  {isRefreshingTools ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      Refreshing...
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3 3 3m-3-3v12" /></svg>
                      Fetch Tools
                    </>
                  )}
                </button>
              </div>

              {/* Connectivity status banner */}
              {connectivityResult && (
                <div
                  className={`mt-2 p-2.5 rounded text-xs flex items-center gap-2 ${
                    connectivityResult.status === 'ok'
                      ? 'bg-green-950/40 text-green-300 border border-green-900'
                      : 'bg-red-950/40 text-red-300 border border-red-900'
                  }`}
                >
                  {connectivityResult.status === 'ok' ? (
                    <svg className="w-4 h-4 shrink-0 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  ) : (
                    <svg className="w-4 h-4 shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  )}
                  <span>{connectivityResult.message}</span>
                </div>
              )}

              {refreshToolsSuccess && (
                <div className="mt-2 p-2 rounded bg-green-950/30 border border-green-900/50 text-green-300 text-xs flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Discovered {dynamicTools.length} tools from MCP server.
                </div>
              )}

              {refreshToolsError && (
                <div className="mt-2 p-2 rounded bg-red-950/30 border border-red-900/50 text-red-300 text-xs flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {refreshToolsError}
                </div>
              )}
            </div>

            {/* Discovered Tools List */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                  Dynamic MCP Tools ({dynamicTools.filter((t) => t.enabled).length}/{dynamicTools.length} enabled)
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleToggleAllTools(true)}
                    className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline"
                  >
                    Enable All
                  </button>
                  <span className="text-gray-600">|</span>
                  <button
                    onClick={() => handleToggleAllTools(false)}
                    className="text-[11px] text-gray-400 hover:text-gray-300 hover:underline"
                  >
                    Disable All
                  </button>
                </div>
              </div>

              {dynamicTools.length === 0 ? (
                <div className="bg-gray-950 p-4 rounded border border-gray-800 text-center text-xs text-gray-500">
                  No tools configured yet. Click <strong className="text-blue-400">Fetch Tools</strong> above to auto-discover tools from your MCP endpoint.
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                  {dynamicTools.map((tool, idx) => (
                    <div
                      key={idx}
                      className={`p-2.5 rounded border transition-colors flex items-start justify-between gap-3 ${
                        tool.enabled
                          ? 'bg-gray-950/70 border-gray-700/80 hover:border-gray-600'
                          : 'bg-gray-950/30 border-gray-800/60 opacity-60'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-purple-300">
                            {tool.name}
                          </span>
                          {tool.displayName && tool.displayName !== tool.name && (
                            <span className="text-[11px] text-gray-400">({tool.displayName})</span>
                          )}
                        </div>
                        {tool.description && (
                          <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2" title={tool.description}>
                            {tool.description}
                          </p>
                        )}
                      </div>

                      {/* Toggle Button */}
                      <button
                        onClick={() => handleToggleTool(tool.name)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded shrink-0 transition-colors ${
                          tool.enabled
                            ? 'bg-green-950 text-green-300 border border-green-800 hover:bg-green-900'
                            : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
                        }`}
                      >
                        {tool.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Authentication & OAuth Parameters */}
          <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800 space-y-4">
            <div
              className="flex justify-between items-center cursor-pointer select-none"
              onClick={() => setShowAdvancedAuth(!showAdvancedAuth)}
            >
              <div>
                <h4 className="text-sm font-bold text-gray-200 uppercase tracking-wider flex items-center gap-2">
                  Authentication & OAuth Settings
                  <span className="text-[11px] font-normal lowercase text-gray-500 font-mono">
                    ({authType})
                  </span>
                </h4>
                <p className="text-xs text-gray-400">
                  OAuth endpoints, scopes, authorization parameters, and credentials.
                </p>
              </div>
              <button className="text-gray-400 hover:text-white p-1">
                <svg
                  className={`w-5 h-5 transform transition-transform ${showAdvancedAuth ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            {showAdvancedAuth && (
              <div className="space-y-4 pt-2 border-t border-gray-800 animate-fadeIn">
                <div className="bg-blue-950/30 border border-blue-800/50 p-2.5 rounded text-xs text-blue-300 flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>
                    <strong>OAuth Credentials:</strong> Google Cloud redacts existing Client ID and Secret when inspecting connectors. When updating general settings (instructions, server description, or dynamic tools), your existing OAuth credentials remain intact and active. Providing a Client ID is only required if you are actively modifying OAuth endpoints or rotating credentials.
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Auth Type */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">
                      Auth Type <span className="text-purple-400 font-mono text-[10px]">(auth_type)</span>
                    </label>
                    <select
                      value={authType}
                      onChange={(e) => setAuthType(e.target.value)}
                      className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="OAUTH">OAUTH</option>
                      <option value="NONE">NONE</option>
                      <option value="API_KEY">API_KEY</option>
                      <option value="BEARER_TOKEN">BEARER_TOKEN</option>
                      <option value="CUSTOM">CUSTOM</option>
                    </select>
                  </div>

                  {/* Scopes */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">
                      OAuth Scopes <span className="text-purple-400 font-mono text-[10px]">(scopes)</span>
                    </label>
                    <input
                      type="text"
                      value={scopes}
                      onChange={(e) => setScopes(e.target.value)}
                      placeholder="openid email https://www.googleapis.com/auth/cloud-platform"
                      className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-white font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Auth URI */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">
                      OAuth Authorization URI <span className="text-purple-400 font-mono text-[10px]">(auth_uri)</span>
                    </label>
                    <input
                      type="text"
                      value={authUri}
                      onChange={(e) => setAuthUri(e.target.value)}
                      placeholder="https://accounts.google.com/o/oauth2/v2/auth"
                      className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-white font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Token URI */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">
                      OAuth Token URI <span className="text-purple-400 font-mono text-[10px]">(token_uri)</span>
                    </label>
                    <input
                      type="text"
                      value={tokenUri}
                      onChange={(e) => setTokenUri(e.target.value)}
                      placeholder="https://oauth2.googleapis.com/token"
                      className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-white font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Auth URI Extra Params */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-300 mb-1">
                      Auth URI Extra Query Params <span className="text-purple-400 font-mono text-[10px]">(auth_uri_params)</span>
                    </label>
                    <input
                      type="text"
                      value={authUriParams}
                      onChange={(e) => setAuthUriParams(e.target.value)}
                      placeholder="&access_type=offline&prompt=consent"
                      className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-white font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Client ID */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">
                      Client ID (Optional Update)
                    </label>
                    <input
                      type="text"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      placeholder="Leave blank to preserve existing credentials"
                      className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-white font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Client Secret */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-semibold text-gray-300">
                        Client Secret (Optional Update)
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowClientSecret(!showClientSecret)}
                        className="text-[10px] text-gray-400 hover:text-white"
                      >
                        {showClientSecret ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <input
                      type={showClientSecret ? 'text' : 'password'}
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      placeholder="Leave blank to preserve existing credentials"
                      className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-white font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 4: General Connector & Custom Parameters */}
          <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800 space-y-4">
            <div className="border-b border-gray-800 pb-2">
              <h4 className="text-sm font-bold text-gray-200 uppercase tracking-wider">
                Schedule & Advanced Parameters
              </h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Refresh Interval */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Sync / Refresh Interval <span className="text-purple-400 font-mono text-[10px]">(refreshInterval)</span>
                </label>
                <select
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="86400s">Every 24 Hours (86400s - Default)</option>
                  <option value="43200s">Every 12 Hours (43200s)</option>
                  <option value="21600s">Every 6 Hours (21600s)</option>
                  <option value="3600s">Every 1 Hour (3600s)</option>
                </select>
              </div>

              {/* Static IP Enabled */}
              <div className="flex items-center justify-between p-3 bg-gray-950 rounded border border-gray-800">
                <div>
                  <div className="text-xs font-semibold text-gray-300">Static IP Routing</div>
                  <div className="text-[11px] text-gray-500">Route connector traffic through GCP static IPs</div>
                </div>
                <button
                  type="button"
                  onClick={() => setStaticIpEnabled(!staticIpEnabled)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                    staticIpEnabled
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {staticIpEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </div>

            {/* Custom Action Parameters Table */}
            <div className="pt-2">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-gray-300">
                  Custom Action Parameters ({customActionParams.length})
                </span>
                <button
                  onClick={handleAddCustomParam}
                  className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-blue-400 hover:text-blue-300 text-xs font-semibold rounded border border-gray-700 flex items-center gap-1 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Add Custom Param
                </button>
              </div>

              {customActionParams.length > 0 && (
                <div className="space-y-2">
                  {customActionParams.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={item.key}
                        onChange={(e) => handleUpdateCustomParam(idx, 'key', e.target.value)}
                        placeholder="Parameter Name"
                        className="w-1/3 bg-gray-950 border border-gray-700 rounded p-2 text-xs text-white font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500"
                      />
                      <input
                        type="text"
                        value={item.value}
                        onChange={(e) => handleUpdateCustomParam(idx, 'value', e.target.value)}
                        placeholder="Value (string, number, or JSON)"
                        className="flex-1 bg-gray-950 border border-gray-700 rounded p-2 text-xs text-white font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={() => handleRemoveCustomParam(idx)}
                        className="p-2 text-gray-500 hover:text-red-400 rounded hover:bg-gray-800 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* RAW JSON EDITOR MODE */
        <div className="space-y-4">
          <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800 space-y-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <h4 className="text-sm font-bold text-gray-200 uppercase tracking-wider font-mono">
                  Live JSON Configuration Editor
                </h4>
                <p className="text-xs text-gray-400">
                  Directly edit the JSON payload. All fields will be parsed and validated before submitting.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleBeautifyJson}
                  className="px-2.5 py-1 text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded border border-gray-700 transition-colors flex items-center gap-1"
                >
                  Format JSON
                </button>
                <button
                  onClick={() => {
                    setRawJsonText(JSON.stringify(currentPayload, null, 2));
                    setRawJsonError(null);
                  }}
                  className="px-2.5 py-1 text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded border border-gray-700 transition-colors"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Update Mask configuration */}
            <div className="p-3 bg-gray-950 rounded border border-gray-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                  Update Mask <span className="text-purple-400 font-mono text-[10px]">(updateMask parameter)</span>
                </span>
                <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useAutoUpdateMask}
                    onChange={(e) => setUseAutoUpdateMask(e.target.checked)}
                    className="rounded bg-gray-900 border-gray-700 text-blue-600 focus:ring-0"
                  />
                  Auto-detect from edited fields
                </label>
              </div>

              <input
                type="text"
                disabled={useAutoUpdateMask}
                value={useAutoUpdateMask ? computedUpdateMask.join(',') : customUpdateMask}
                onChange={(e) => setCustomUpdateMask(e.target.value)}
                placeholder="action_config.action_params,dynamic_tools,bap_config"
                className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-xs font-mono text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-60"
              />
              <p className="text-[10px] text-gray-500">
                Comma-separated paths specifying which fields to update (e.g.{' '}
                <code className="text-purple-300">action_config.action_params</code>,{' '}
                <code className="text-purple-300">dynamic_tools</code>,{' '}
                <code className="text-purple-300">bap_config</code>).
              </p>
            </div>

            {/* JSON Textarea */}
            <div>
              <textarea
                value={rawJsonText}
                onChange={(e) => {
                  setRawJsonText(e.target.value);
                  try {
                    JSON.parse(e.target.value);
                    setRawJsonError(null);
                  } catch (err: any) {
                    setRawJsonError(`Syntax Error: ${err.message}`);
                  }
                }}
                rows={16}
                className={`w-full bg-gray-950 p-3 rounded font-mono text-xs leading-relaxed focus:outline-none custom-scrollbar ${
                  rawJsonError
                    ? 'border-2 border-red-500 text-red-200'
                    : 'border border-gray-700 text-gray-200 focus:border-blue-500'
                }`}
              />
              {rawJsonError && (
                <div className="mt-1 text-xs text-red-400 font-mono flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {rawJsonError}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons & cURL preview */}
      <div className="bg-gray-900/80 p-4 rounded-lg border border-gray-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleCopyCurl}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold rounded border border-gray-700 transition-colors flex items-center gap-1.5 shadow-sm"
          >
            {copiedCurl ? (
              <>
                <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                <span className="text-green-300 font-bold">cURL Copied!</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-2M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m-6 9h6m-6 4h6" /></svg>
                Copy cURL (PATCH)
              </>
            )}
          </button>

          <button
            onClick={handleCopyJson}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold rounded border border-gray-700 transition-colors flex items-center gap-1.5 shadow-sm"
          >
            {copiedJson ? (
              <>
                <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                <span className="text-green-300 font-bold">JSON Copied!</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-gray-400 font-mono" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                Copy JSON
              </>
            )}
          </button>
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <button
            onClick={handleSave}
            disabled={isSaving || (editorMode === 'json' && Boolean(rawJsonError))}
            className="w-full md:w-auto px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-bold rounded-md shadow-md transition-all flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Saving BYOMCP Settings...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Save Settings to Connector
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BYOMCPConfigTab;
