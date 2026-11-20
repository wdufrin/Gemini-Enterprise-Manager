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

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as api from '../services/apiService';
import {
  DevToolsConfig,
  DevToolsFileAccessPolicy,
  DevToolsJavascriptExecutionPolicy,
  DevToolsTerminalAutoExecutionPolicy,
  Page,
} from '../types';
import { GEMINI_ENTERPRISE_LOCATIONS, isModelSupportedInRegion } from '../utils/locations';
import { useProjectEnrollment } from '../context/ProjectEnrollmentContext';
import { useWorkspaceScope } from '../context/WorkspaceScopeContext';
import PageShell from '../components/layout/PageShell';
import PageHeader from '../components/layout/PageHeader';
import ScopeBar from '../components/layout/ScopeBar';
import { Tabs, TabItem } from '../components/common/Tabs';
import { toErrorMessage } from '../utils/errors';

export type DevToolsPolicyTab = 'all' | 'core' | 'governance' | 'mcp' | 'models' | 'logging';

const DEVTOOLS_TAB_ITEMS: readonly TabItem<DevToolsPolicyTab>[] = [
  { id: 'all', label: 'All Policy Domains' },
  { id: 'core', label: 'Agents & IDE' },
  { id: 'governance', label: 'Browser & Plugins' },
  { id: 'mcp', label: 'MCP Governance' },
  { id: 'models', label: 'Models & Residency' },
  { id: 'logging', label: 'Telemetry & cURL' },
];

export interface DevToolsPageProps {
  projectNumber: string;
  projectId?: string;
  setProjectNumber?: (projectNumber: string) => void;
}

export const FIRST_PARTY_DEVTOOLS_MODELS = [
  'gemini-4-neon',
  'gemini-4-hydrogen',
  'gemini-4-carbon',
  'gemini-4-argon',
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-2.5-pro',
] as const;

export const THIRD_PARTY_DEVTOOLS_MODELS = [
  'claude-opus-5-5',
  'claude-sonnet-5-5',
] as const;

export const GLOBAL_FALLBACK_LOCATIONS = [
  'ca',
  'br',
  'in',
  'sg',
  'au',
  'europe-west2',
  'asia-northeast1',
] as const;

export interface ActuationUrlsValidationResult {
  valid: boolean;
  urls: string[];
  invalidUrls: string[];
  error?: string;
}

/**
 * Parses newline/comma-delimited browser actuation URLs and validates that every entry
 * is a well-formed `https://` URL (supporting optional wildcard subdomains like `https://*.example.com`).
 */
export function parseAndValidateActuationUrls(raw: string): ActuationUrlsValidationResult {
  const tokens = raw
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  const uniqueTokens = Array.from(new Set(tokens));
  const validUrls: string[] = [];
  const invalidUrls: string[] = [];

  for (const token of uniqueTokens) {
    if (!token.startsWith('https://')) {
      invalidUrls.push(token);
      continue;
    }
    if (/\s/.test(token)) {
      invalidUrls.push(token);
      continue;
    }

    // Support wildcard subdomain pattern `https://*.domain.tld/...` by substituting a probe label for URL parsing
    const probeCandidate = token.startsWith('https://*.')
      ? `https://wildcard-probe.${token.slice('https://*.'.length)}`
      : token;

    try {
      const parsed = new URL(probeCandidate);
      const hostname = parsed.hostname;
      const hasValidDomain =
        hostname === 'localhost' ||
        (hostname.includes('.') &&
          !hostname.startsWith('.') &&
          !hostname.endsWith('.') &&
          !hostname.includes('..'));

      if (
        parsed.protocol !== 'https:' ||
        !hasValidDomain ||
        Boolean(parsed.username) ||
        Boolean(parsed.password)
      ) {
        invalidUrls.push(token);
      } else {
        validUrls.push(token);
      }
    } catch {
      invalidUrls.push(token);
    }
  }

  if (invalidUrls.length > 0) {
    return {
      valid: false,
      urls: validUrls,
      invalidUrls,
      error: `Invalid actuation URL(s): ${invalidUrls.join(', ')}. Every entry must be a valid https:// URL.`,
    };
  }

  return {
    valid: true,
    urls: validUrls,
    invalidUrls: [],
  };
}

export interface McpAllowlistValidationResult {
  valid: boolean;
  value?: Record<string, unknown>;
  error?: string;
}

/**
 * Validates that the MCP allowlist editor contains a valid JSON object (rejecting syntax errors, arrays, null, and primitives).
 */
export function validateMcpAllowlistJson(raw: string): McpAllowlistValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      valid: false,
      error: 'MCP allowlist must be a valid JSON object (use {} when no servers are allowlisted).',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err: unknown) {
    return {
      valid: false,
      error: `Invalid JSON in MCP allowlist: ${toErrorMessage(err)}`,
    };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      valid: false,
      error: 'MCP allowlist must be a JSON object (arrays, null, and primitive values are rejected).',
    };
  }

  return {
    valid: true,
    value: parsed as Record<string, unknown>,
  };
}

export function buildDevToolsCurlPreview(
  projectId: string,
  location: string,
  payload: Partial<DevToolsConfig>,
  updateMask: string[],
): { getCurl: string; patchCurl: string } {
  const safeProject = (projectId || '[YOUR_PROJECT_ID]').trim();
  const safeLoc = (location || 'global').trim().toLowerCase();
  const host =
    safeLoc === 'global'
      ? 'https://discoveryengine.googleapis.com'
      : `https://${safeLoc}-discoveryengine.googleapis.com`;
  const resourcePath = `projects/${safeProject}/locations/${safeLoc}/devToolsConfig`;
  const getUrl = `${host}/v1alpha/${resourcePath}`;
  const maskQuery = updateMask.join(',');
  const patchUrl = `${getUrl}?updateMask=${encodeURIComponent(maskQuery)}`;
  const bodyJson = JSON.stringify({ name: resourcePath, ...payload }, null, 2);

  const getCurl = [
    `curl -X GET \\`,
    `  -H "Authorization: Bearer $(gcloud auth print-access-token)" \\`,
    `  -H "X-Goog-User-Project: ${safeProject}" \\`,
    `  "${getUrl}"`,
  ].join('\n');

  const patchCurl = [
    `curl -X PATCH \\`,
    `  -H "Authorization: Bearer $(gcloud auth print-access-token)" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -H "X-Goog-User-Project: ${safeProject}" \\`,
    `  -d '${bodyJson.replace(/'/g, "'\\''")}' \\`,
    `  "${patchUrl}"`,
  ].join('\n');

  return { getCurl, patchCurl };
}

const DevToolsPage: React.FC<DevToolsPageProps> = ({
  projectNumber,
  projectId,
}) => {
  const effectiveProjectId = (projectId || projectNumber || '').trim();
  const {
    enrollment,
    isProbingEnrollment,
    isGoogleInternal,
    isTrustedTester,
    refreshEnrollment,
  } = useProjectEnrollment();
  const { appLocation: scopedLocation, setAppLocation: setScopedLocation } = useWorkspaceScope();

  const [location, setLocation] = useState<string>(() => scopedLocation || 'global');
  const [activeTab, setActiveTab] = useState<DevToolsPolicyTab>('all');
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const lastLoadedConfigRef = useRef<DevToolsConfig>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [uninitializedNotice, setUninitializedNotice] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [showCurlPreview, setShowCurlPreview] = useState<boolean>(true);
  const [copiedCurlType, setCopiedCurlType] = useState<'get' | 'patch' | null>(null);

  // Keep local location synchronized if global workspace scope changes externally while clean
  useEffect(() => {
    if (scopedLocation && scopedLocation !== location && !isDirty) {
      setLocation(scopedLocation);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedLocation]);

  // Master Switch
  const [devToolsEnabled, setDevToolsEnabled] = useState<boolean>(false);

  // Antigravity Agent Security (agentConfig)
  const [sandboxModeEnabled, setSandboxModeEnabled] = useState<boolean>(true);
  const [outsideWorkspaceFileAccessPolicy, setOutsideWorkspaceFileAccessPolicy] =
    useState<DevToolsFileAccessPolicy | string>('FILE_ACCESS_POLICY_ALWAYS_ASK');
  const [terminalCommandAutoExecutionPolicy, setTerminalCommandAutoExecutionPolicy] =
    useState<DevToolsTerminalAutoExecutionPolicy | string>(
      'TERMINAL_COMMAND_AUTO_EXECUTION_POLICY_REQUIRE_REVIEW',
    );

  // Browser Actuation Policy (browserConfig)
  const [browserEnabled, setBrowserEnabled] = useState<boolean>(false);
  const [javascriptExecutionPolicy, setJavascriptExecutionPolicy] =
    useState<DevToolsJavascriptExecutionPolicy | string>(
      'JAVASCRIPT_EXECUTION_POLICY_REQUEST_REVIEW',
    );
  const [actuationUrlsText, setActuationUrlsText] = useState<string>('');

  // Slash Commands & Plugins (featureConfig & pluginConfig)
  const [remoteControlEnabled, setRemoteControlEnabled] = useState<boolean>(false);
  const [boostCommandEnabled, setBoostCommandEnabled] = useState<boolean>(true);
  const [teamworkAndSwarmEnabled, setTeamworkAndSwarmEnabled] = useState<boolean>(true);
  const [pluginsDisabled, setPluginsDisabled] = useState<boolean>(false);
  const [marketplaceDisabled, setMarketplaceDisabled] = useState<boolean>(false);

  // MCP Governance (mcpConfig)
  const [mcpEnabled, setMcpEnabled] = useState<boolean>(false);
  const [mcpAllowlistText, setMcpAllowlistText] = useState<string>('{}');

  // Authorized Models & Residency (modelConfig & residencyConfig)
  const [allowedModels, setAllowedModels] = useState<string[]>([]);
  const [allowedThirdPartyModels, setAllowedThirdPartyModels] = useState<string[]>([]);
  const [fallbackEnabledLocationIds, setFallbackEnabledLocationIds] = useState<string[]>([]);

  // Compliance Logging (loggingConfig)
  const [metadataLoggingEnabled, setMetadataLoggingEnabled] = useState<boolean>(false);
  const [promptAndResponseLoggingEnabled, setPromptAndResponseLoggingEnabled] =
    useState<boolean>(false);

  const hydrateFromConfig = useCallback((cfg: DevToolsConfig) => {
    setDevToolsEnabled(Boolean(cfg.devToolsEnabled));

    setSandboxModeEnabled(cfg.agentConfig?.sandboxModeEnabled ?? true);
    setOutsideWorkspaceFileAccessPolicy(
      cfg.agentConfig?.outsideWorkspaceFileAccessPolicy || 'FILE_ACCESS_POLICY_ALWAYS_ASK',
    );
    setTerminalCommandAutoExecutionPolicy(
      cfg.agentConfig?.terminalCommandAutoExecutionPolicy ||
        'TERMINAL_COMMAND_AUTO_EXECUTION_POLICY_REQUIRE_REVIEW',
    );

    setBrowserEnabled(Boolean(cfg.browserConfig?.browserEnabled));
    setJavascriptExecutionPolicy(
      cfg.browserConfig?.javascriptExecutionPolicy || 'JAVASCRIPT_EXECUTION_POLICY_REQUEST_REVIEW',
    );
    setActuationUrlsText((cfg.browserConfig?.actuationAllowedUrls || []).join('\n'));

    setRemoteControlEnabled(Boolean(cfg.featureConfig?.remoteControlEnabled));
    setBoostCommandEnabled(!cfg.featureConfig?.multiagentConfig?.boostCommandDisabled);
    setTeamworkAndSwarmEnabled(
      !cfg.featureConfig?.multiagentConfig?.teamworkPreviewCommandDisabled,
    );

    setPluginsDisabled(Boolean(cfg.pluginConfig?.pluginsDisabled));
    setMarketplaceDisabled(Boolean(cfg.pluginConfig?.marketplaceDisabled));

    setMcpEnabled(Boolean(cfg.mcpConfig?.mcpEnabled));
    setMcpAllowlistText(JSON.stringify(cfg.mcpConfig?.mcpAllowlist || {}, null, 2));

    setAllowedModels(cfg.modelConfig?.allowedModels || []);
    setAllowedThirdPartyModels(cfg.modelConfig?.allowedThirdPartyModels || []);
    setFallbackEnabledLocationIds(cfg.residencyConfig?.fallbackEnabledLocationIds || []);

    setMetadataLoggingEnabled(Boolean(cfg.loggingConfig?.metadataLoggingEnabled));
    setPromptAndResponseLoggingEnabled(
      Boolean(cfg.loggingConfig?.promptAndResponseLoggingEnabled),
    );
    setIsDirty(false);
  }, []);

  const handleDiscardChanges = useCallback(() => {
    hydrateFromConfig(lastLoadedConfigRef.current);
    setSaveSuccess(null);
    setError(null);
  }, [hydrateFromConfig]);

  const handleLocationChange = useCallback(
    (nextLoc: string) => {
      if (nextLoc === location) return;
      if (
        isDirty &&
        typeof window !== 'undefined' &&
        typeof window.confirm === 'function' &&
        !window.confirm(
          `You have unsaved AI Developer Tools policy changes in "${location}". Discard changes and switch location to "${nextLoc}"?`,
        )
      ) {
        return;
      }
      setIsDirty(false);
      setLocation(nextLoc);
      setScopedLocation(nextLoc);
    },
    [location, isDirty, setScopedLocation],
  );

  const configFetchSeqRef = useRef(0);

  const fetchConfig = useCallback(async () => {
    if (!effectiveProjectId) return;
    const seq = ++configFetchSeqRef.current;
    setIsLoading(true);
    setError(null);
    setUninitializedNotice(null);
    setSaveSuccess(null);

    try {
      const cfg = await api.getDevToolsConfig({
        projectId: effectiveProjectId,
        appLocation: location,
      });
      if (seq !== configFetchSeqRef.current) return;
      const resolvedCfg = cfg || {};
      lastLoadedConfigRef.current = resolvedCfg;
      hydrateFromConfig(resolvedCfg);
    } catch (err: unknown) {
      if (seq !== configFetchSeqRef.current) return;
      const msg = toErrorMessage(err);
      const status = (err as { status?: number; code?: number } | undefined)?.status ??
        (err as { status?: number; code?: number } | undefined)?.code;
      if (status === 404 || /\b404\b|not[_\s-]?found/i.test(msg)) {
        lastLoadedConfigRef.current = {};
        hydrateFromConfig({});
        setUninitializedNotice(
          `No DevToolsConfig singleton exists yet in ${location} (${msg}). Configure settings below and click Save Policy to initialize it.`,
        );
      } else {
        setIsDirty(false);
        setError(`Failed to load DevToolsConfig (${location}): ${msg}`);
      }
    } finally {
      if (seq === configFetchSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, [effectiveProjectId, location, hydrateFromConfig]);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const urlValidation = useMemo(
    () => parseAndValidateActuationUrls(actuationUrlsText),
    [actuationUrlsText],
  );

  const mcpValidation = useMemo(
    () => validateMcpAllowlistJson(mcpAllowlistText),
    [mcpAllowlistText],
  );

  const updateMask = useMemo(() => {
    const mask = [
      'devToolsEnabled',
      'agentConfig',
      'browserConfig',
      'featureConfig',
      'pluginConfig',
      'mcpConfig',
      'modelConfig',
      'loggingConfig',
    ];
    if (location === 'global') {
      mask.push('residencyConfig');
    }
    return mask;
  }, [location]);

  const draftPayload: Partial<DevToolsConfig> = useMemo(() => {
    const payload: Partial<DevToolsConfig> = {
      devToolsEnabled,
      agentConfig: {
        sandboxModeEnabled,
        outsideWorkspaceFileAccessPolicy,
        terminalCommandAutoExecutionPolicy,
      },
      browserConfig: {
        browserEnabled,
        javascriptExecutionPolicy,
        actuationAllowedUrls: urlValidation.urls,
      },
      featureConfig: {
        remoteControlEnabled,
        multiagentConfig: {
          boostCommandDisabled: !boostCommandEnabled,
          teamworkPreviewCommandDisabled: !teamworkAndSwarmEnabled,
        },
      },
      pluginConfig: {
        pluginsDisabled,
        marketplaceDisabled,
      },
      mcpConfig: {
        mcpEnabled,
        mcpAllowlist: mcpValidation.valid ? mcpValidation.value || {} : {},
      },
      modelConfig: {
        allowedModels,
        allowedThirdPartyModels,
      },
      loggingConfig: {
        metadataLoggingEnabled,
        promptAndResponseLoggingEnabled,
      },
    };

    if (location === 'global') {
      payload.residencyConfig = {
        fallbackEnabledLocationIds,
      };
    }

    return payload;
  }, [
    devToolsEnabled,
    sandboxModeEnabled,
    outsideWorkspaceFileAccessPolicy,
    terminalCommandAutoExecutionPolicy,
    browserEnabled,
    javascriptExecutionPolicy,
    urlValidation.urls,
    remoteControlEnabled,
    boostCommandEnabled,
    teamworkAndSwarmEnabled,
    pluginsDisabled,
    marketplaceDisabled,
    mcpEnabled,
    mcpValidation.valid,
    mcpValidation.value,
    allowedModels,
    allowedThirdPartyModels,
    location,
    fallbackEnabledLocationIds,
    metadataLoggingEnabled,
    promptAndResponseLoggingEnabled,
  ]);

  const curlPreview = useMemo(
    () => buildDevToolsCurlPreview(effectiveProjectId, location, draftPayload, updateMask),
    [effectiveProjectId, location, draftPayload, updateMask],
  );

  const toggleSelection = (
    item: string,
    current: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    setIsDirty(true);
    if (current.includes(item)) {
      setter(current.filter((x) => x !== item));
    } else {
      setter([...current, item]);
    }
  };

  const handleFormatMcpJson = () => {
    if (mcpValidation.valid && mcpValidation.value) {
      setMcpAllowlistText(JSON.stringify(mcpValidation.value, null, 2));
    }
  };

  const handleSave = async () => {
    setSaveSuccess(null);
    setError(null);

    if (!effectiveProjectId) {
      setError('Project ID / Number is required before saving DevToolsConfig.');
      return;
    }
    if (!urlValidation.valid) {
      setError(urlValidation.error || 'Fix invalid browser actuation URLs before saving.');
      return;
    }
    if (!mcpValidation.valid) {
      setError(mcpValidation.error || 'Fix invalid MCP allowlist JSON before saving.');
      return;
    }

    setIsSaving(true);
    try {
      const updated = await api.updateDevToolsConfig(draftPayload, updateMask, {
        projectId: effectiveProjectId,
        appLocation: location,
      });
      lastLoadedConfigRef.current = updated || {};
      hydrateFromConfig(updated);
      setUninitializedNotice(null);
      setSaveSuccess(`Saved AI Developer Tools policy for ${effectiveProjectId} (${location}).`);
    } catch (err: unknown) {
      setError(`Failed to update DevToolsConfig: ${toErrorMessage(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyCurl = async (type: 'get' | 'patch', text: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopiedCurlType(type);
        setTimeout(() => setCopiedCurlType(null), 2000);
      }
    } catch (err: unknown) {
      setError(`Clipboard copy failed: ${toErrorMessage(err)}`);
    }
  };

  const allKnown1pModels = useMemo(
    () =>
      Array.from(
        new Set([...FIRST_PARTY_DEVTOOLS_MODELS, ...allowedModels]),
      ),
    [allowedModels],
  );

  const allKnown3pModels = useMemo(
    () =>
      Array.from(
        new Set([...THIRD_PARTY_DEVTOOLS_MODELS, ...allowedThirdPartyModels]),
      ),
    [allowedThirdPartyModels],
  );

  const canSave =
    Boolean(effectiveProjectId) &&
    !isLoading &&
    !isSaving &&
    urlValidation.valid &&
    mcpValidation.valid;

  const showCore = activeTab === 'all' || activeTab === 'core';
  const showGovernance = activeTab === 'all' || activeTab === 'governance';
  const showMcp = activeTab === 'all' || activeTab === 'mcp';
  const showModels = activeTab === 'all' || activeTab === 'models';
  const showLogging = activeTab === 'all' || activeTab === 'logging';

  return (
    <PageShell variant="wide">
      <PageHeader
        title="AI Developer Tools"
        subtitle="Configure organization-wide Google Antigravity, IDE plugin, MCP allowlist, and data-residency governance."
        consolePage={Page.DEV_TOOLS}
        projectId={projectId}
        projectNumber={projectNumber}
        onRefresh={() => void fetchConfig()}
        isRefreshing={isLoading}
        refreshDisabled={!effectiveProjectId}
        secondaryActions={
          <button
            type="button"
            onClick={() => setShowCurlPreview((prev) => !prev)}
            className="inline-flex items-center px-3 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs sm:text-sm font-medium text-gray-200 hover:text-white transition-colors"
          >
            {showCurlPreview ? 'Hide cURL' : 'Show cURL'}
          </button>
        }
        primaryAction={{
          label: isSaving ? 'Saving...' : 'Save Policy',
          onClick: () => void handleSave(),
          disabled: !canSave,
          testId: 'save-devtools-config-btn',
        }}
      >
        <ScopeBar
          embedded
          locationId="devtools-location-select"
          locationLabel="Gemini Enterprise Location"
          locationValue={location}
          onLocationChange={handleLocationChange}
          locationOptions={GEMINI_ENTERPRISE_LOCATIONS.map((loc) => ({
            value: loc.id,
            label: loc.label,
          }))}
          actions={
            <label className="inline-flex items-center cursor-pointer shrink-0 bg-gray-950/70 border border-gray-800 rounded-lg px-3 h-9">
              <input
                type="checkbox"
                aria-label="Enable AI Developer Tools"
                data-testid="devtools-enabled-toggle"
                checked={devToolsEnabled}
                onChange={(e) => {
                  setDevToolsEnabled(e.target.checked);
                  setIsDirty(true);
                }}
                className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-xs sm:text-sm font-medium text-gray-200">
                <code className="font-mono text-blue-300 mr-1">devToolsEnabled:</code>
                {devToolsEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          }
        />
      </PageHeader>

      {/* Sunset & Transition Banner */}
      <div
        data-testid="code-assist-sunset-banner"
        className="bg-indigo-950/50 border border-indigo-700/80 rounded-lg p-4 text-sm text-indigo-100 flex items-start gap-3"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
        <div className="space-y-1">
          <p className="font-semibold text-white">
            Transition from Bundled Gemini Code Assist to Google Antigravity &amp; AI Developer Tools
          </p>
          <p className="text-indigo-200 leading-relaxed">
            Bundled <strong>Gemini Code Assist</strong> entitlements ended for new Gemini Enterprise
            subscriptions on <strong>October 9, 2026</strong> and sunset for existing subscriptions on{' '}
            <strong>March 31, 2027</strong>. Enterprise developer workflows are replaced by{' '}
            <strong>Google Antigravity</strong> &amp; <strong>AI Developer Tools</strong> governed via{' '}
            <code className="bg-indigo-900/70 px-1.5 py-0.5 rounded text-xs">DevToolsConfig</code>.
          </p>
        </div>
      </div>

      {/* v1alpha Enrollment Readiness Notice */}
      <div
        data-testid="devtools-enrollment-notice"
        className={`rounded-lg p-4 border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          isGoogleInternal || isTrustedTester
            ? 'bg-emerald-950/30 border-emerald-800/70 text-emerald-200'
            : 'bg-amber-950/30 border-amber-800/70 text-amber-200'
        }`}
      >
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-white text-sm">
              Discovery Engine v1alpha API Readiness
            </span>
            <span className="px-2 py-0.5 rounded bg-gray-800 border border-gray-700 font-mono text-[11px] text-gray-200">
              GOOGLE_INTERNAL / TRUSTED_TESTER
            </span>
            {isGoogleInternal && (
              <span className="px-2 py-0.5 rounded bg-emerald-900/60 border border-emerald-700 text-emerald-200 font-semibold">
                GOOGLE_INTERNAL Enrolled
              </span>
            )}
            {!isGoogleInternal && isTrustedTester && (
              <span className="px-2 py-0.5 rounded bg-blue-900/60 border border-blue-700 text-blue-200 font-semibold">
                TRUSTED_TESTER Enrolled
              </span>
            )}
          </div>
          <p className="leading-relaxed">
            Singleton endpoint{' '}
            <code className="font-mono text-gray-200">
              /v1alpha/projects/{effectiveProjectId || '{project}'}/locations/{location}/devToolsConfig
            </code>{' '}
            requires <code className="font-mono text-gray-200">discoveryengine.devToolsConfigs.*</code>{' '}
            IAM permissions and <code className="font-mono text-gray-200">GOOGLE_INTERNAL</code> or{' '}
            <code className="font-mono text-gray-200">TRUSTED_TESTER</code> project allowlisting on{' '}
            <code className="font-mono text-gray-200">v1alpha</code>.
            {enrollment?.checkedAt
              ? ` Last probed: ${new Date(enrollment.checkedAt).toLocaleTimeString()}.`
              : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshEnrollment()}
          disabled={isProbingEnrollment || !effectiveProjectId}
          className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-200 font-medium shrink-0 disabled:opacity-50"
        >
          {isProbingEnrollment ? 'Probing...' : 'Re-check Enrollment'}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          data-testid="devtools-error-banner"
          className="bg-red-900/30 border border-red-800 rounded-md p-3 text-sm text-red-200"
        >
          {error}
        </div>
      )}

      {uninitializedNotice && (
        <div
          data-testid="devtools-uninitialized-banner"
          className="bg-amber-900/30 border border-amber-800 rounded-md p-3 text-sm text-amber-200"
        >
          {uninitializedNotice}
        </div>
      )}

      {saveSuccess && (
        <div
          role="status"
          data-testid="devtools-save-success"
          className="bg-green-900/30 border border-green-800 rounded-md p-3 text-sm text-green-200"
        >
          {saveSuccess}
        </div>
      )}

      <Tabs
        items={DEVTOOLS_TAB_ITEMS}
        activeTab={activeTab}
        onChange={setActiveTab}
        ariaLabel="AI Developer Tools Policy Domains"
        syncSearchParam="tab"
      />

      {/* Grid of Policy Cards */}
      {(showCore || showGovernance || showMcp) && (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* 1. Antigravity Agent Security (agentConfig) */}
        {showCore && (
        <section className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-gray-100">
              Antigravity Agent Security (<code className="text-xs font-mono text-blue-300">agentConfig</code>)
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Enforce OS-level sandboxing, out-of-workspace filesystem boundaries, and terminal auto-execution gates.
            </p>
          </div>

          <label className="flex items-center justify-between gap-3 p-3 rounded bg-gray-900/60 border border-gray-700 cursor-pointer">
            <div>
              <span className="text-sm font-medium text-gray-200 block">
                Sandbox Mode Enabled (<code className="text-xs font-mono">sandboxModeEnabled</code>)
              </span>
              <span className="text-xs text-gray-400">
                Isolates agent subprocesses inside a restricted OS sandbox container.
              </span>
            </div>
            <input
              type="checkbox"
              aria-label="Sandbox Mode Enabled"
              checked={sandboxModeEnabled}
              onChange={(e) => {
                setSandboxModeEnabled(e.target.checked);
                setIsDirty(true);
              }}
              className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600"
            />
          </label>

          <div>
            <label
              htmlFor="outside-workspace-file-policy"
              className="block text-xs font-semibold text-gray-300 mb-1"
            >
              Outside-Workspace File Access Policy (<code className="font-mono">outsideWorkspaceFileAccessPolicy</code>)
            </label>
            <select
              id="outside-workspace-file-policy"
              aria-label="Outside-Workspace File Access Policy"
              value={outsideWorkspaceFileAccessPolicy}
              onChange={(e) => {
                setOutsideWorkspaceFileAccessPolicy(e.target.value);
                setIsDirty(true);
              }}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="FILE_ACCESS_POLICY_DENY">
                FILE_ACCESS_POLICY_DENY — Strictly block file reads/writes outside workspace
              </option>
              <option value="FILE_ACCESS_POLICY_ALWAYS_ASK">
                FILE_ACCESS_POLICY_ALWAYS_ASK — Require explicit user confirmation
              </option>
              <option value="FILE_ACCESS_POLICY_NOT_ENFORCED">
                FILE_ACCESS_POLICY_NOT_ENFORCED — Delegate to local developer preference
              </option>
            </select>
          </div>

          <div>
            <label
              htmlFor="terminal-auto-exec-policy"
              className="block text-xs font-semibold text-gray-300 mb-1"
            >
              Terminal Command Auto-Execution Policy (<code className="font-mono">terminalCommandAutoExecutionPolicy</code>)
            </label>
            <select
              id="terminal-auto-exec-policy"
              aria-label="Terminal Command Auto-Execution Policy"
              value={terminalCommandAutoExecutionPolicy}
              onChange={(e) => {
                setTerminalCommandAutoExecutionPolicy(e.target.value);
                setIsDirty(true);
              }}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="TERMINAL_COMMAND_AUTO_EXECUTION_POLICY_REQUIRE_REVIEW">
                TERMINAL_COMMAND_AUTO_EXECUTION_POLICY_REQUIRE_REVIEW — Require human review before running commands
              </option>
              <option value="TERMINAL_COMMAND_AUTO_EXECUTION_POLICY_PROCEED_IN_SANDBOX">
                TERMINAL_COMMAND_AUTO_EXECUTION_POLICY_PROCEED_IN_SANDBOX — Allow auto-execution inside sandbox only
              </option>
              <option value="TERMINAL_COMMAND_AUTO_EXECUTION_POLICY_NOT_ENFORCED">
                TERMINAL_COMMAND_AUTO_EXECUTION_POLICY_NOT_ENFORCED — Not enforced by admin policy
              </option>
            </select>
          </div>
        </section>
        )}

        {/* 2. Browser Actuation Policy (browserConfig) */}
        {showGovernance && (
        <section className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-gray-100">
              Browser Actuation Policy (<code className="text-xs font-mono text-blue-300">browserConfig</code>)
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Control automated browser subagents, DOM JavaScript injection, and permitted <code className="font-mono">https://</code> origin allowlists.
            </p>
          </div>

          <label className="flex items-center justify-between gap-3 p-3 rounded bg-gray-900/60 border border-gray-700 cursor-pointer">
            <div>
              <span className="text-sm font-medium text-gray-200 block">
                Browser Actuation Enabled (<code className="text-xs font-mono">browserEnabled</code>)
              </span>
              <span className="text-xs text-gray-400">
                Allows Antigravity agents to launch managed Chromium sessions for UI testing and web tasks.
              </span>
            </div>
            <input
              type="checkbox"
              aria-label="Browser Actuation Enabled"
              checked={browserEnabled}
              onChange={(e) => {
                setBrowserEnabled(e.target.checked);
                setIsDirty(true);
              }}
              className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600"
            />
          </label>

          <div>
            <label
              htmlFor="js-execution-policy"
              className="block text-xs font-semibold text-gray-300 mb-1"
            >
              JavaScript Execution Policy (<code className="font-mono">javascriptExecutionPolicy</code>)
            </label>
            <select
              id="js-execution-policy"
              aria-label="JavaScript Execution Policy"
              value={javascriptExecutionPolicy}
              onChange={(e) => {
                setJavascriptExecutionPolicy(e.target.value);
                setIsDirty(true);
              }}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="JAVASCRIPT_EXECUTION_POLICY_DISABLED">
                JAVASCRIPT_EXECUTION_POLICY_DISABLED — Block arbitrary page JS execution
              </option>
              <option value="JAVASCRIPT_EXECUTION_POLICY_REQUEST_REVIEW">
                JAVASCRIPT_EXECUTION_POLICY_REQUEST_REVIEW — Require developer approval per script
              </option>
              <option value="JAVASCRIPT_EXECUTION_POLICY_NOT_ENFORCED">
                JAVASCRIPT_EXECUTION_POLICY_NOT_ENFORCED — Not enforced by admin policy
              </option>
            </select>
          </div>

          <div>
            <label
              htmlFor="actuation-allowed-urls"
              className="block text-xs font-semibold text-gray-300 mb-1"
            >
              Actuation Allowed URLs (<code className="font-mono">actuationAllowedUrls</code> — newline or comma-separated <code className="font-mono">https://</code> URLs)
            </label>
            <textarea
              id="actuation-allowed-urls"
              aria-label="Actuation Allowed URLs"
              data-testid="actuation-allowed-urls-input"
              rows={3}
              value={actuationUrlsText}
              onChange={(e) => {
                setActuationUrlsText(e.target.value);
                setIsDirty(true);
              }}
              placeholder="https://console.cloud.google.com&#10;https://*.corp.example.com"
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-xs font-mono text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {!urlValidation.valid && (
              <p
                role="alert"
                data-testid="actuation-urls-error"
                className="mt-1.5 text-xs text-red-300 bg-red-900/30 border border-red-800 rounded px-2.5 py-1.5"
              >
                {urlValidation.error}
              </p>
            )}
            {urlValidation.valid && urlValidation.urls.length > 0 && (
              <p className="mt-1 text-[11px] text-gray-400">
                {urlValidation.urls.length} validated HTTPS URL pattern(s) configured.
              </p>
            )}
          </div>
        </section>
        )}

        {/* 3. Slash Commands & Plugins (featureConfig & pluginConfig) */}
        {showGovernance && (
        <section className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-gray-100">
              Slash Commands &amp; Plugins (<code className="text-xs font-mono text-blue-300">featureConfig</code> &amp; <code className="text-xs font-mono text-blue-300">pluginConfig</code>)
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Govern multi-agent orchestration slash commands, remote control sessions, and IDE plugin marketplace access.
            </p>
          </div>

          <div className="space-y-2.5">
            <label className="flex items-center justify-between gap-3 p-3 rounded bg-gray-900/60 border border-gray-700 cursor-pointer">
              <div>
                <span className="text-sm font-medium text-gray-200 block">
                  Remote Control Enabled (<code className="text-xs font-mono">remoteControlEnabled</code>)
                </span>
                <span className="text-xs text-gray-400">
                  Permits authenticated remote attachment to active developer agent workspaces.
                </span>
              </div>
              <input
                type="checkbox"
                aria-label="Remote Control Enabled"
                checked={remoteControlEnabled}
                onChange={(e) => {
                  setRemoteControlEnabled(e.target.checked);
                  setIsDirty(true);
                }}
                className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600"
              />
            </label>

            <label className="flex items-center justify-between gap-3 p-3 rounded bg-gray-900/60 border border-gray-700 cursor-pointer">
              <div>
                <span className="text-sm font-medium text-gray-200 block">
                  Enable <code className="text-xs font-mono text-emerald-300">/boost</code> Command (<code className="text-xs font-mono">!boostCommandDisabled</code>)
                </span>
                <span className="text-xs text-gray-400">
                  Allows developers to invoke high-compute <code className="font-mono">/boost</code> reasoning passes.
                </span>
              </div>
              <input
                type="checkbox"
                aria-label="Enable /boost Command"
                data-testid="boost-command-toggle"
                checked={boostCommandEnabled}
                onChange={(e) => {
                  setBoostCommandEnabled(e.target.checked);
                  setIsDirty(true);
                }}
                className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600"
              />
            </label>

            <label className="flex items-center justify-between gap-3 p-3 rounded bg-gray-900/60 border border-gray-700 cursor-pointer">
              <div>
                <span className="text-sm font-medium text-gray-200 block">
                  Enable <code className="text-xs font-mono text-emerald-300">/teamwork</code> &amp; <code className="text-xs font-mono text-emerald-300">/swarm</code> Multi-Agent Commands (<code className="text-xs font-mono">!teamworkPreviewCommandDisabled</code>)
                </span>
                <span className="text-xs text-gray-400">
                  Per Nov 16, 2026 release notes, <code className="font-mono">teamworkPreviewCommandDisabled</code> jointly controls both <code className="font-mono">/teamwork</code> and parallel <code className="font-mono">/swarm</code> worker orchestration.
                </span>
              </div>
              <input
                type="checkbox"
                aria-label="Enable /teamwork and /swarm Multi-Agent Commands"
                data-testid="teamwork-swarm-toggle"
                checked={teamworkAndSwarmEnabled}
                onChange={(e) => {
                  setTeamworkAndSwarmEnabled(e.target.checked);
                  setIsDirty(true);
                }}
                className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600"
              />
            </label>

            <label className="flex items-center justify-between gap-3 p-3 rounded bg-gray-900/60 border border-gray-700 cursor-pointer">
              <div>
                <span className="text-sm font-medium text-gray-200 block">
                  Disable Plugins (<code className="text-xs font-mono">pluginsDisabled</code>)
                </span>
                <span className="text-xs text-gray-400">
                  Blocks loading custom skills, hooks, and third-party plugin bundles in Antigravity clients.
                </span>
              </div>
              <input
                type="checkbox"
                aria-label="Disable Plugins"
                checked={pluginsDisabled}
                onChange={(e) => {
                  setPluginsDisabled(e.target.checked);
                  setIsDirty(true);
                }}
                className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600"
              />
            </label>

            <label className="flex items-center justify-between gap-3 p-3 rounded bg-gray-900/60 border border-gray-700 cursor-pointer">
              <div>
                <span className="text-sm font-medium text-gray-200 block">
                  Disable Plugin Marketplace (<code className="text-xs font-mono">marketplaceDisabled</code>)
                </span>
                <span className="text-xs text-gray-400">
                  Hides and blocks installation from the external Agent &amp; Plugin Marketplace catalog.
                </span>
              </div>
              <input
                type="checkbox"
                aria-label="Disable Plugin Marketplace"
                checked={marketplaceDisabled}
                onChange={(e) => {
                  setMarketplaceDisabled(e.target.checked);
                  setIsDirty(true);
                }}
                className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600"
              />
            </label>
          </div>
        </section>
        )}

        {/* 4. MCP Governance (mcpConfig) */}
        {showMcp && (
        <section className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-gray-100">
                MCP Governance (<code className="text-xs font-mono text-blue-300">mcpConfig</code>)
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Enable Model Context Protocol servers and define a strict JSON object allowlist of approved MCP server definitions.
              </p>
            </div>
            <button
              type="button"
              onClick={handleFormatMcpJson}
              disabled={!mcpValidation.valid}
              className="px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 border border-gray-600 text-xs text-gray-200 disabled:opacity-40 shrink-0"
            >
              Format JSON
            </button>
          </div>

          <label className="flex items-center justify-between gap-3 p-3 rounded bg-gray-900/60 border border-gray-700 cursor-pointer">
            <div>
              <span className="text-sm font-medium text-gray-200 block">
                MCP Servers Enabled (<code className="text-xs font-mono">mcpEnabled</code>)
              </span>
              <span className="text-xs text-gray-400">
                Permits Antigravity developer agents to connect to approved local or remote MCP tool servers.
              </span>
            </div>
            <input
              type="checkbox"
              aria-label="MCP Servers Enabled"
              checked={mcpEnabled}
              onChange={(e) => {
                setMcpEnabled(e.target.checked);
                setIsDirty(true);
              }}
              className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600"
            />
          </label>

          <div>
            <label
              htmlFor="mcp-allowlist-json"
              className="block text-xs font-semibold text-gray-300 mb-1"
            >
              MCP Allowlist JSON Object (<code className="font-mono">mcpAllowlist</code>)
            </label>
            <textarea
              id="mcp-allowlist-json"
              aria-label="MCP Allowlist JSON Object"
              data-testid="mcp-allowlist-input"
              rows={6}
              value={mcpAllowlistText}
              onChange={(e) => {
                setMcpAllowlistText(e.target.value);
                setIsDirty(true);
              }}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-xs font-mono text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {!mcpValidation.valid && (
              <p
                role="alert"
                data-testid="mcp-allowlist-error"
                className="mt-1.5 text-xs text-red-300 bg-red-900/30 border border-red-800 rounded px-2.5 py-1.5"
              >
                {mcpValidation.error}
              </p>
            )}
          </div>
        </section>
        )}
      </div>
      )}

      {/* 5. Authorized Models & Residency (modelConfig & residencyConfig) */}
      {showModels && (
      <section className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-gray-100">
              Authorized Models &amp; Residency (<code className="text-xs font-mono text-blue-300">modelConfig</code> &amp; <code className="text-xs font-mono text-blue-300">residencyConfig</code>)
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Restrict first-party Gemini models (empty = all 1P models allowed), opt into third-party partner models, and configure global residency fallback locations.
            </p>
          </div>
          <span
            data-testid="allowed-1p-models-summary"
            className="px-2.5 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-gray-300 shrink-0"
          >
            {allowedModels.length === 0
              ? 'All 1P models allowed (empty list)'
              : `${allowedModels.length} 1P model(s) restricted`}
          </span>
        </div>

        {/* 1P Models */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-300">
              First-Party Allowed Models (<code className="font-mono">allowedModels</code>)
            </span>
            {allowedModels.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setAllowedModels([]);
                  setIsDirty(true);
                }}
                className="text-xs text-blue-400 hover:text-blue-300 underline"
              >
                Clear selection (allow all 1P models)
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {allKnown1pModels.map((modelId) => {
              const selected = allowedModels.includes(modelId);
              const supportedInLoc = isModelSupportedInRegion(modelId, location);
              return (
                <button
                  key={modelId}
                  type="button"
                  data-testid={`model-chip-1p-${modelId}`}
                  aria-pressed={selected}
                  onClick={() => toggleSelection(modelId, allowedModels, setAllowedModels)}
                  className={`px-3 py-1.5 rounded-full text-xs font-mono border transition-colors flex items-center gap-1.5 ${
                    selected
                      ? 'bg-blue-600/90 border-blue-400 text-white'
                      : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-500'
                  }`}
                  title={
                    supportedInLoc
                      ? `Available in ${location}`
                      : `ModelRegistry note: ${modelId} may not be natively served in ${location}`
                  }
                >
                  <span>{modelId}</span>
                  {!supportedInLoc && (
                    <span className="text-[10px] text-amber-300 font-sans">(regional limit)</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3P Models */}
        <div className="space-y-2 pt-3 border-t border-gray-700/70">
          <span className="block text-xs font-semibold text-gray-300">
            Opt-In Third-Party Models (<code className="font-mono">allowedThirdPartyModels</code>)
          </span>
          <div className="flex flex-wrap gap-2">
            {allKnown3pModels.map((modelId) => {
              const selected = allowedThirdPartyModels.includes(modelId);
              return (
                <button
                  key={modelId}
                  type="button"
                  data-testid={`model-chip-3p-${modelId}`}
                  aria-pressed={selected}
                  onClick={() =>
                    toggleSelection(modelId, allowedThirdPartyModels, setAllowedThirdPartyModels)
                  }
                  className={`px-3 py-1.5 rounded-full text-xs font-mono border transition-colors ${
                    selected
                      ? 'bg-purple-600/90 border-purple-400 text-white'
                      : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-500'
                  }`}
                >
                  {modelId}
                </button>
              );
            })}
          </div>
        </div>

        {/* Global Residency Fallback Locations */}
        {location === 'global' ? (
          <div
            data-testid="global-residency-fallback-section"
            className="space-y-2 pt-3 border-t border-gray-700/70"
          >
            <span className="block text-xs font-semibold text-gray-300">
              Global Residency Fallback Locations (<code className="font-mono">residencyConfig.fallbackEnabledLocationIds</code>)
            </span>
            <p className="text-xs text-gray-400">
              Select in-country DRZ locations permitted to fall back to <code className="font-mono">global</code> model endpoints when regional capacity or model availability requires overflow routing.
            </p>
            <div className="flex flex-wrap gap-2">
              {GLOBAL_FALLBACK_LOCATIONS.map((locId) => {
                const selected = fallbackEnabledLocationIds.includes(locId);
                return (
                  <button
                    key={locId}
                    type="button"
                    data-testid={`fallback-loc-chip-${locId}`}
                    aria-pressed={selected}
                    onClick={() =>
                      toggleSelection(
                        locId,
                        fallbackEnabledLocationIds,
                        setFallbackEnabledLocationIds,
                      )
                    }
                    className={`px-3 py-1.5 rounded-full text-xs font-mono border transition-colors ${
                      selected
                        ? 'bg-emerald-700/90 border-emerald-400 text-white'
                        : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    {locId}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="pt-3 border-t border-gray-700/70 text-xs text-gray-400">
            <code className="font-mono text-gray-300">residencyConfig.fallbackEnabledLocationIds</code>{' '}
            is configured on the <code className="font-mono text-gray-300">global</code> singleton resource (currently viewing <code className="font-mono text-gray-300">{location}</code>).
          </div>
        )}
      </section>
      )}

      {/* 6. Compliance Logging (loggingConfig) */}
      {showLogging && (
      <section className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-gray-100">
            Compliance Logging (<code className="text-xs font-mono text-blue-300">loggingConfig</code>)
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Configure enterprise audit telemetry for Antigravity developer sessions in Cloud Logging.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center justify-between gap-3 p-3 rounded bg-gray-900/60 border border-gray-700 cursor-pointer">
            <div>
              <span className="text-sm font-medium text-gray-200 block">
                Metadata Logging Enabled (<code className="text-xs font-mono">metadataLoggingEnabled</code>)
              </span>
              <span className="text-xs text-gray-400">
                Logs invocation timestamps, model IDs, token counts, and tool names without prompt payloads.
              </span>
            </div>
            <input
              type="checkbox"
              aria-label="Metadata Logging Enabled"
              checked={metadataLoggingEnabled}
              onChange={(e) => {
                setMetadataLoggingEnabled(e.target.checked);
                setIsDirty(true);
              }}
              className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600"
            />
          </label>

          <label className="flex items-center justify-between gap-3 p-3 rounded bg-gray-900/60 border border-gray-700 cursor-pointer">
            <div>
              <span className="text-sm font-medium text-gray-200 block">
                Prompt &amp; Response Logging Enabled (<code className="text-xs font-mono">promptAndResponseLoggingEnabled</code>)
              </span>
              <span className="text-xs text-gray-400">
                Records full developer prompts, code context, and model responses to Cloud Logging sinks.
              </span>
            </div>
            <input
              type="checkbox"
              aria-label="Prompt and Response Logging Enabled"
              checked={promptAndResponseLoggingEnabled}
              onChange={(e) => {
                setPromptAndResponseLoggingEnabled(e.target.checked);
                setIsDirty(true);
              }}
              className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600"
            />
          </label>
        </div>
      </section>
      )}

      {/* Live cURL Preview */}
      {showLogging && (activeTab === 'logging' || showCurlPreview) && (
        <section
          data-testid="devtools-curl-preview"
          className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wider">
              Live REST / cURL Preview (<code className="font-mono text-xs text-blue-300">v1alpha</code>)
            </h3>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400">GET DevToolsConfig</span>
                <button
                  type="button"
                  onClick={() => void handleCopyCurl('get', curlPreview.getCurl)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  {copiedCurlType === 'get' ? 'Copied!' : 'Copy GET'}
                </button>
              </div>
              <pre className="bg-gray-900 border border-gray-700 rounded p-3 text-[11px] font-mono text-gray-200 overflow-x-auto whitespace-pre-wrap">
                {curlPreview.getCurl}
              </pre>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400">PATCH DevToolsConfig</span>
                <button
                  type="button"
                  onClick={() => void handleCopyCurl('patch', curlPreview.patchCurl)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  {copiedCurlType === 'patch' ? 'Copied!' : 'Copy PATCH'}
                </button>
              </div>
              <pre
                data-testid="devtools-patch-curl"
                className="bg-gray-900 border border-gray-700 rounded p-3 text-[11px] font-mono text-gray-200 overflow-x-auto whitespace-pre-wrap max-h-72"
              >
                {curlPreview.patchCurl}
              </pre>
            </div>
          </div>
        </section>
      )}

      {/* Sticky Bottom Unsaved Policy Changes Bar */}
      {isDirty && (
        <div
          data-testid="devtools-unsaved-bar"
          className="sticky bottom-3 z-30 bg-gray-900/95 backdrop-blur-md border border-amber-600/70 rounded-xl px-4 py-3 shadow-2xl flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 text-xs sm:text-sm text-amber-200 font-medium">
            <span
              className="h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse shrink-0"
              aria-hidden="true"
            />
            <span>Unsaved policy changes</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="discard-devtools-changes-btn"
              onClick={handleDiscardChanges}
              disabled={isSaving}
              className="px-3 py-1.5 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs sm:text-sm font-medium text-gray-200 hover:text-white transition-colors disabled:opacity-50"
            >
              Discard
            </button>
            <button
              type="button"
              data-testid="sticky-save-devtools-btn"
              onClick={() => void handleSave()}
              disabled={!canSave}
              className="px-3.5 py-1.5 h-9 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : 'Save Policy'}
            </button>
          </div>
        </div>
      )}
    </PageShell>
  );
};

export default DevToolsPage;
