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

import { Config, DataConnector, Operation } from '../../../types';
import * as api from '../../../services/apiService';
import { toErrorMessage } from '../../../utils/errors';
import { deriveConnectorRemediation } from '../connectorDiagnostics';
import { ChecklistProbeConfig, ProbeExecutionResult } from './types';

/**
 * Credential fields that Google Cloud Discovery Engine treats as write-only
 * and either strips or masks ("***", "REDACTED") on `dataConnector.get`.
 * Automated probes must NEVER fail or warn solely because these fields are absent
 * or masked in the GET response payload.
 */
export const WRITE_ONLY_CREDENTIAL_FIELDS = [
  'client_id',
  'client_secret',
  'refresh_token',
  'access_token',
  'api_key',
  'private_key',
  'password',
  'secret',
  'oauth_secret',
] as const;

export function isRedactedOrWriteOnlyValue(val: unknown): boolean {
  if (val === undefined || val === null || val === '') return true;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return true;
    if (/^(\*+|•+|redacted|<redacted>|\.{3,})$/i.test(trimmed)) return true;
  }
  return false;
}

function nonRedactedString(val: unknown): string | undefined {
  if (typeof val !== 'string' || isRedactedOrWriteOnlyValue(val)) return undefined;
  return val.trim();
}

export interface ExtractedDiagnosticSignals {
  hasAnyDiagnosticsEnvelope: boolean;
  hardOpFailures: Operation[];
  partialOpWarnings: Operation[];
  unresolvedLogs: Array<{ timestamp?: string; message: string }>;
  resolvedLogs: Array<{ timestamp?: string; message: string }>;
  diagnosticsErrors: string[];
  diagnosticsWarnings: string[];
  authOpErrors: string[];
  authLogErrors: string[];
}

const AUTH_ERROR_REGEX =
  /401|403|unauthenticated|unauthorized|invalid_client|invalid_grant|invalid_auth|oauth|token|credential|permission_denied|aadsts|redirect_uri|insufficient_scope/i;

export function extractDiagnosticSignals(connectorInput: any): ExtractedDiagnosticSignals {
  const connectorState = connectorInput?.connectorState || connectorInput || {};
  const rawOperations: Operation[] = Array.isArray(connectorInput?.rawOperations)
    ? connectorInput.rawOperations
    : [];
  const recentLogs: Array<Record<string, any>> = Array.isArray(connectorInput?.recentLogs)
    ? connectorInput.recentLogs
    : [];
  const diagnosticsErrors: string[] = Array.isArray(connectorInput?.diagnostics?.errors)
    ? connectorInput.diagnostics.errors
    : [];
  const diagnosticsWarnings: string[] = Array.isArray(connectorInput?.diagnostics?.warnings)
    ? connectorInput.diagnostics.warnings
    : [];

  const hasAnyDiagnosticsEnvelope =
    Array.isArray(connectorInput?.rawOperations) ||
    Array.isArray(connectorInput?.recentLogs) ||
    Boolean(connectorInput?.diagnostics);

  const latestRunObj = connectorState?.latestRun as
    | { error?: { message?: string }; endTime?: string; startTime?: string }
    | undefined;
  const latestHealthyRunTime =
    !latestRunObj?.error && (latestRunObj?.endTime || latestRunObj?.startTime)
      ? new Date(latestRunObj.endTime || latestRunObj.startTime || '').getTime()
      : NaN;

  const hardOpFailures: Operation[] = [];
  const partialOpWarnings: Operation[] = [];
  const authOpErrors: string[] = [];

  for (const op of rawOperations) {
    if (!op) continue;
    const hasOpError = Boolean(op.error);
    const metadata = op.metadata as
      | { failureCount?: string | number; createTime?: string; updateTime?: string }
      | undefined;
    const failureCount = metadata?.failureCount ? parseInt(String(metadata.failureCount), 10) : 0;
    const response = op.response as
      | { errorSamples?: unknown[]; errorConfig?: { gcsPrefix?: string } }
      | undefined;
    const hasImportErrors =
      failureCount > 0 ||
      (Array.isArray(response?.errorSamples) && response.errorSamples.length > 0);

    const rawOpTime = metadata?.updateTime || metadata?.createTime;
    const opTimeMs = rawOpTime ? new Date(rawOpTime).getTime() : NaN;
    const isRecent = !Number.isNaN(opTimeMs) && opTimeMs > Date.now() - 86400000;
    if (!isRecent) continue;

    const resolvedByNewerRun =
      connectorState.state === 'ACTIVE' &&
      !Number.isNaN(latestHealthyRunTime) &&
      !Number.isNaN(opTimeMs) &&
      opTimeMs < latestHealthyRunTime;

    if (hasOpError && !resolvedByNewerRun) {
      hardOpFailures.push(op);
      const errText = op.error?.message || JSON.stringify(op.error);
      if (errText && AUTH_ERROR_REGEX.test(errText)) {
        authOpErrors.push(errText);
      }
    } else if (hasOpError || hasImportErrors) {
      partialOpWarnings.push(op);
    }
  }

  const unresolvedLogs: Array<{ timestamp?: string; message: string }> = [];
  const resolvedLogs: Array<{ timestamp?: string; message: string }> = [];
  const authLogErrors: string[] = [];

  for (const log of recentLogs) {
    if (!log) continue;
    const payloadText = [
      typeof log.textPayload === 'string' ? log.textPayload : '',
      log.jsonPayload ? JSON.stringify(log.jsonPayload) : '',
      log.protoPayload ? JSON.stringify(log.protoPayload) : '',
    ]
      .filter(Boolean)
      .join(' ')
      .trim();
    const message = payloadText || `Cloud Logging ${log.severity || 'ERROR'} entry`;
    const logTimeMs = log.timestamp ? new Date(log.timestamp).getTime() : NaN;
    const isResolved =
      connectorState.state === 'ACTIVE' &&
      !connectorState.latestRun?.error &&
      !Number.isNaN(latestHealthyRunTime) &&
      !Number.isNaN(logTimeMs) &&
      logTimeMs < latestHealthyRunTime;

    if (isResolved) {
      resolvedLogs.push({ timestamp: log.timestamp, message });
    } else {
      unresolvedLogs.push({ timestamp: log.timestamp, message });
      if (AUTH_ERROR_REGEX.test(message)) {
        authLogErrors.push(message);
      }
    }
  }

  return {
    hasAnyDiagnosticsEnvelope,
    hardOpFailures,
    partialOpWarnings,
    unresolvedLogs,
    resolvedLogs,
    diagnosticsErrors,
    diagnosticsWarnings,
    authOpErrors,
    authLogErrors,
  };
}

function buildRemediationString(errorText: string, dataSource?: string): string | undefined {
  const guidance = deriveConnectorRemediation(errorText, dataSource);
  if (!guidance) return undefined;
  return `${guidance.title}: ${guidance.steps.join(' ')}`;
}

export function runProbeSyncOrAsync(
  probe: ChecklistProbeConfig,
  connector: DataConnector | any,
  config: Config
): ProbeExecutionResult | Promise<ProbeExecutionResult> {
  const executedAt = new Date().toISOString();
  const connectorState = connector?.connectorState || connector || {};
  const dataSource = String(connectorState.dataSource || '').toLowerCase();

  try {
    switch (probe.type) {
      case 'IAM_PERMISSION_CHECK': {
        const permissions = probe.requiredPermissions || [
          'discoveryengine.dataStores.get',
          'discoveryengine.collections.get',
        ];
        if (!config.projectId) {
          return {
            status: 'warning',
            message: 'No Google Cloud project ID configured in session.',
            remediation:
              'Select or enter a valid Google Cloud Project ID in the header bar before running IAM permission probes.',
            verificationSource: 'GCP_API',
            executedAt,
          };
        }

        const fullConnectorName =
          (typeof connector?.name === 'string' && connector.name) ||
          (typeof connectorState?.name === 'string' && connectorState.name) ||
          '';
        const projectNumMatch = fullConnectorName.match(/^projects\/(\d+)\//);
        const resolvedProjectNumber =
          projectNumMatch?.[1] || (/^\d+$/.test(config.projectId) ? config.projectId : '');
        const saEmail = resolvedProjectNumber
          ? `service-${resolvedProjectNumber}@gcp-sa-discoveryengine.iam.gserviceaccount.com`
          : 'discoveryengine-service-agent';

        const formatIamResult = (
          result: { hasAll: boolean; missing: string[] } | undefined
        ): ProbeExecutionResult => {
          if (!result || typeof result.hasAll !== 'boolean' || result.hasAll) {
            return {
              status: 'pass',
              message: `All ${permissions.length} verified project IAM permissions are active for ${saEmail}.`,
              verificationSource: 'GCP_API',
              details: { grantedPermissions: permissions },
              executedAt,
            };
          }
          return {
            status: 'fail',
            message: `Missing required IAM permissions: ${result.missing.join(', ')}`,
            remediation: `In Google Cloud Console > IAM & Admin > IAM, check "Include Google-provided role grants", locate ${saEmail}, and grant a role containing: ${result.missing.join(', ')}.`,
            verificationSource: 'GCP_API',
            details: { missing: result.missing },
            executedAt,
          };
        };

        const formatIamError = (err: unknown): ProbeExecutionResult => {
          const errMsg = toErrorMessage(err);
          return {
            status: 'fail',
            message: `IAM Permission Check Failed: ${errMsg}`,
            remediation:
              buildRemediationString(errMsg, dataSource) ||
              'Verify your user account has resourcemanager.projects.getIamPolicy or testIamPermissions access on the project.',
            verificationSource: 'GCP_API',
            executedAt,
          };
        };

        try {
          const maybePromise = api.checkServiceAccountPermissions(
            config.projectId,
            saEmail,
            permissions
          );
          if (maybePromise && typeof (maybePromise as Promise<unknown>).then === 'function') {
            return maybePromise.then(formatIamResult).catch(formatIamError);
          }
          return formatIamResult(
            maybePromise as unknown as { hasAll: boolean; missing: string[] } | undefined
          );
        } catch (err: unknown) {
          return formatIamError(err);
        }
      }

      case 'MCP_CONNECTIVITY': {
        const params = connectorState.params || {};
        const actionConfig = connectorState.actionConfig || {};
        const actionParams = actionConfig.actionParams || {};
        const instanceUri =
          nonRedactedString(params.instance_uri) ||
          nonRedactedString(actionParams.instance_uri);

        if (!instanceUri) {
          return {
            status: 'warning',
            message: 'No MCP instance_uri configured in connector parameters.',
            remediation:
              'Configure params.instance_uri or actionConfig.actionParams.instance_uri with your HTTPS MCP server endpoint.',
            verificationSource: 'GCP_API',
            executedAt,
          };
        }

        const parts = (connector?.name || connectorState.name || '').split('/');
        const projId =
          (parts.indexOf('projects') !== -1 ? parts[parts.indexOf('projects') + 1] : undefined) ||
          config.projectId;

        const formatMcpResult = (tools: unknown[] | undefined): ProbeExecutionResult => {
          if (!tools || tools.length === 0) {
            return {
              status: 'fail',
              message: `Connected to MCP server (${instanceUri}), but tools/list returned empty array.`,
              remediation:
                'Verify your MCP server registers at least one tool in its JSON-RPC tools/list handler and that Cloud Run IAM Invoker permissions are granted.',
              verificationSource: 'GCP_API',
              details: { instanceUri },
              executedAt,
            };
          }
          return {
            status: 'pass',
            message: `Successfully connected to MCP endpoint! Discovered ${tools.length} active dynamic tools.`,
            verificationSource: 'GCP_API',
            details: { toolsCount: tools.length, instanceUri },
            executedAt,
          };
        };

        const formatMcpError = (err: unknown): ProbeExecutionResult => {
          const errMsg = toErrorMessage(err);
          return {
            status: 'fail',
            message: `Failed to connect to MCP endpoint (${instanceUri}): ${errMsg}`,
            remediation:
              buildRemediationString(`MCP Connectivity Failed: ${errMsg}`, 'custom_mcp') ||
              'Ensure the MCP endpoint is reachable over HTTPS and grants roles/run.invoker to the Discovery Engine Service Agent.',
            verificationSource: 'GCP_API',
            executedAt,
          };
        };

        try {
          const maybePromise = api.listMcpTools(projId, instanceUri);
          if (maybePromise && typeof (maybePromise as Promise<unknown>).then === 'function') {
            return maybePromise.then(formatMcpResult).catch(formatMcpError);
          }
          return formatMcpResult(maybePromise as unknown as unknown[] | undefined);
        } catch (err: unknown) {
          return formatMcpError(err);
        }
      }

      case 'CONNECTOR_STATUS': {
        const signals = extractDiagnosticSignals(connector);

        if (connectorState.state === 'FAILED') {
          const errMsg =
            connectorState.latestRun?.error?.message ||
            connectorState.errorConfig?.error?.message ||
            signals.hardOpFailures[0]?.error?.message ||
            signals.unresolvedLogs[0]?.message ||
            'Connector is in FAILED state in Google Cloud Discovery Engine.';
          return {
            status: 'fail',
            message: 'Connector is in FAILED state in Google Cloud Discovery Engine.',
            remediation:
              buildRemediationString(errMsg, dataSource) ||
              'Inspect the Recent Operations and Recent Error Logs in the Overview & Logs tab and verify all checklist prerequisites.',
            verificationSource: signals.hasAnyDiagnosticsEnvelope ? 'DIAGNOSTICS_SIGNALS' : 'GCP_API',
            details: connectorState,
            executedAt,
          };
        }

        if (connectorState.latestRun?.error) {
          const errMsg = connectorState.latestRun.error.message || 'Unknown error';
          return {
            status: 'fail',
            message: `Latest sync run failed: ${errMsg}`,
            remediation:
              buildRemediationString(errMsg, dataSource) ||
              'Review the sync failure details in the Overview & Logs tab and re-verify vendor portal permissions.',
            verificationSource: 'GCP_API',
            details: connectorState.latestRun.error,
            executedAt,
          };
        }

        if (connectorState.errorConfig?.error) {
          const errMsg = connectorState.errorConfig.error.message || 'Configuration error';
          return {
            status: 'fail',
            message: `Connector error config: ${errMsg}`,
            remediation:
              buildRemediationString(errMsg, dataSource) ||
              'Update the connector configuration parameters in Google Cloud Console and retry.',
            verificationSource: 'GCP_API',
            details: connectorState.errorConfig.error,
            executedAt,
          };
        }

        // Unify with LRO operations (hardOpFailures within last 24h not resolved by a newer healthy run)
        if (signals.hardOpFailures.length > 0) {
          const firstOp = signals.hardOpFailures[0];
          const opErrMsg = firstOp?.error?.message || 'Operation failed';
          return {
            status: 'fail',
            message: `Sync Failures Detected: ${signals.hardOpFailures.length} failed operation(s) in the last 24h (${opErrMsg}).`,
            remediation:
              buildRemediationString(opErrMsg, dataSource) ||
              'Inspect the failed LRO operation in the Overview & Logs tab and resolve the underlying source API error.',
            verificationSource: 'DIAGNOSTICS_SIGNALS',
            details: { failedOperations: signals.hardOpFailures },
            executedAt,
          };
        }

        // Unify with Cloud Logging / Diagnostics errors when connector is not confirmed ACTIVE
        if (connectorState.state && connectorState.state !== 'ACTIVE' && signals.unresolvedLogs.length > 0) {
          const latestLogMsg = signals.unresolvedLogs[0].message;
          return {
            status: 'fail',
            message: `Validation Failed: ${signals.unresolvedLogs.length} recent Cloud Logging error(s) (${latestLogMsg}).`,
            remediation:
              buildRemediationString(latestLogMsg, dataSource) ||
              'Inspect Cloud Logging entries in the Overview & Logs tab.',
            verificationSource: 'DIAGNOSTICS_SIGNALS',
            details: { unresolvedLogs: signals.unresolvedLogs },
            executedAt,
          };
        }

        if (connectorState.state === 'INACTIVE') {
          return {
            status: 'warning',
            message: 'Connector state is currently INACTIVE.',
            remediation:
              'Complete initial connector authorization in Google Cloud Console or trigger an initial sync run.',
            verificationSource: 'GCP_API',
            executedAt,
          };
        }

        // Surface warnings when connector is ACTIVE but recent LRO warnings or Cloud Logging errors exist
        if (signals.partialOpWarnings.length > 0 || signals.unresolvedLogs.length > 0) {
          const warnParts: string[] = [];
          if (signals.partialOpWarnings.length > 0) {
            warnParts.push(
              `${signals.partialOpWarnings.length} partial/historical operation warning(s)`
            );
          }
          if (signals.unresolvedLogs.length > 0) {
            warnParts.push(
              `${signals.unresolvedLogs.length} recent error log(s) (${signals.unresolvedLogs[0].message})`
            );
          }
          const combinedSample =
            signals.unresolvedLogs[0]?.message ||
            signals.partialOpWarnings[0]?.error?.message ||
            'Warning in recent sync diagnostics';
          return {
            status: 'warning',
            message: `Connector state is ${connectorState.state || 'ACTIVE'}, but diagnostics recorded ${warnParts.join(' and ')}.`,
            remediation:
              buildRemediationString(combinedSample, dataSource) ||
              'Review Recent Operations and Cloud Logging in the Overview & Logs tab to confirm item-level errors are resolved.',
            verificationSource: 'DIAGNOSTICS_SIGNALS',
            details: {
              partialOpWarnings: signals.partialOpWarnings,
              unresolvedLogs: signals.unresolvedLogs,
            },
            executedAt,
          };
        }

        return {
          status: 'pass',
          message: `Connector state is ${connectorState.state || 'ACTIVE'} with zero reported sync failures.`,
          verificationSource: signals.hasAnyDiagnosticsEnvelope ? 'DIAGNOSTICS_SIGNALS' : 'GCP_API',
          executedAt,
        };
      }

      case 'OAUTH_CONFIG_VALIDITY': {
        const params = connectorState.params || {};
        const actionConfig = connectorState.actionConfig || {};
        const actionParams = actionConfig.actionParams || {};
        const signals = extractDiagnosticSignals(connector);

        // Identify any write-only credential fields that are absent or masked on GET
        const redactedCredentials = WRITE_ONLY_CREDENTIAL_FIELDS.filter(
          (field) =>
            isRedactedOrWriteOnlyValue(params[field]) &&
            isRedactedOrWriteOnlyValue(actionParams[field])
        );

        // 1. Check for explicit Discovery Engine blocking reasons
        if (
          Array.isArray(connectorState.blockingReasons) &&
          connectorState.blockingReasons.length > 0
        ) {
          const joinedReasons = connectorState.blockingReasons.join(', ');
          return {
            status: 'fail',
            message: `Connector blocked by Discovery Engine: ${joinedReasons}`,
            remediation:
              buildRemediationString(joinedReasons, dataSource) ||
              'Re-authorize the OAuth client in Google Cloud Console and verify all required vendor scopes.',
            verificationSource: 'GCP_API',
            details: { blockingReasons: connectorState.blockingReasons },
            executedAt,
          };
        }

        // 2. Check for explicit auth / OAuth errors in latestRun, errorConfig, LRO operations, or Cloud Logging
        const directErrMsg =
          connectorState.latestRun?.error?.message ||
          connectorState.errorConfig?.error?.message ||
          (Array.isArray(connectorState.errors) && connectorState.errors[0]?.message) ||
          '';
        const matchedDirectAuthErr =
          directErrMsg && AUTH_ERROR_REGEX.test(directErrMsg) ? directErrMsg : '';
        const hardAuthError =
          matchedDirectAuthErr ||
          signals.authOpErrors[0] ||
          (connectorState.state !== 'ACTIVE' ? signals.authLogErrors[0] : '') ||
          '';

        if (hardAuthError) {
          return {
            status: 'fail',
            message: `Authentication / OAuth failure reported by Discovery Engine: ${hardAuthError}`,
            remediation:
              buildRemediationString(hardAuthError, dataSource) ||
              'Verify your OAuth Client ID, Client Secret, Redirect URI, and API Scopes in the 3rd-party vendor developer portal.',
            verificationSource: matchedDirectAuthErr ? 'GCP_API' : 'DIAGNOSTICS_SIGNALS',
            details: { error: hardAuthError, redactedCredentials },
            executedAt,
          };
        }

        if (
          connectorState.state === 'ACTIVE' &&
          signals.authLogErrors[0] &&
          connectorState.actionState !== 'FAILED'
        ) {
          const authLogWarn = signals.authLogErrors[0];
          return {
            status: 'warning',
            message: `Connector state is ACTIVE, but recent Cloud Logging recorded an auth/permission entry: ${authLogWarn}`,
            remediation:
              buildRemediationString(authLogWarn, dataSource) ||
              'Review Recent Error Logs in the Overview & Logs tab to confirm whether item-level permissions or scopes need adjustment.',
            verificationSource: 'DIAGNOSTICS_SIGNALS',
            details: { warning: authLogWarn, redactedCredentials },
            executedAt,
          };
        }

        // 3. Check Assistant Actions state if ACTIONS mode is enabled
        const modes: string[] = Array.isArray(connectorState.connectorModes)
          ? connectorState.connectorModes
          : [];
        if (modes.includes('ACTIONS')) {
          if (connectorState.actionState === 'FAILED') {
            return {
              status: 'fail',
              message:
                'Assistant Actions state is FAILED in Discovery Engine (verify 3LO OAuth Client ID, Secret, and Redirect URI in the vendor portal).',
              remediation:
                'Ensure https://vertexaisearch.cloud.google.com/oauth-redirect is allowlisted in the vendor OAuth app and action write scopes are granted.',
              verificationSource: 'GCP_API',
              details: { actionState: connectorState.actionState },
              executedAt,
            };
          }
          if (actionConfig.isActionConfigured === false) {
            return {
              status: 'warning',
              message:
                'ACTIONS mode is enabled on connector, but actionConfig.isActionConfigured is false.',
              remediation:
                'Complete the Assistant Actions OAuth client configuration in Google Cloud Console.',
              verificationSource: 'GCP_API',
              details: { actionConfig },
              executedAt,
            };
          }
        }

        // 4. BYO_MCP (custom_mcp): auth_uri, token_uri, and scopes ARE returned in actionParams
        // (while client_id and client_secret are redacted by Google Cloud on GET).
        const authType = (
          nonRedactedString(actionParams.auth_type) ||
          nonRedactedString(params.auth_type) ||
          ''
        ).toUpperCase();
        if (dataSource === 'custom_mcp') {
          const resolvedMcpAuth = authType || 'NONE';
          if (resolvedMcpAuth === 'NONE') {
            return {
              status: 'pass',
              message: 'BYO-MCP auth_type is NONE (no OAuth client credentials required).',
              verificationSource: 'GCP_API',
              executedAt,
            };
          }
          if (resolvedMcpAuth === 'OAUTH') {
            const authUri =
              nonRedactedString(actionParams.auth_uri) || nonRedactedString(params.auth_uri);
            const tokenUri =
              nonRedactedString(actionParams.token_uri) || nonRedactedString(params.token_uri);
            const hasScopes = Boolean(
              !isRedactedOrWriteOnlyValue(actionParams.scopes) ||
                !isRedactedOrWriteOnlyValue(params.scopes)
            );
            if (!authUri || !tokenUri) {
              return {
                status: 'warning',
                message:
                  'BYO-MCP auth_type is OAUTH, but auth_uri or token_uri is missing in actionParams (note: client_id and client_secret are write-only and redacted by GCP on read).',
                remediation:
                  'Provide both auth_uri and token_uri in actionConfig.actionParams when configuring OAuth 2.0 for a custom MCP connector.',
                verificationSource: 'GCP_API',
                details: { authUri, tokenUri, redactedCredentials },
                executedAt,
              };
            }
            return {
              status: 'pass',
              message: `BYO-MCP OAuth endpoints verified (auth_uri & token_uri configured, scopes: ${hasScopes ? 'set' : 'default'}; client_id & client_secret are write-only/redacted by GCP).`,
              verificationSource: 'GCP_API',
              details: { authType: resolvedMcpAuth, authUri, tokenUri, hasScopes, redactedCredentials },
              executedAt,
            };
          }
        }

        // 5. Microsoft connectors: verify non-redacted tenant_id / instance_id / host endpoint
        const isMicrosoft = [
          'sharepoint',
          'ms_sharepoint',
          'ms-sharepoint',
          'sharepoint_online',
          'onedrive',
          'ms_onedrive',
          'ms-onedrive',
          'onedrive_for_business',
          'outlook',
          'ms_outlook',
          'ms-outlook',
          'exchange',
          'teams',
          'ms_teams',
          'ms-teams',
          'microsoft_teams',
          'entra',
          'entraid',
          'entra_id',
          'entra-id',
          'azure_ad',
          'azure_active_directory',
          'dynamics365',
          'dynamics_365',
          'ms_dynamics',
          'dynamics',
        ].includes(dataSource);

        const hostUri =
          nonRedactedString(params.instance_uri) ||
          nonRedactedString(params.domain) ||
          nonRedactedString(params.subdomain) ||
          nonRedactedString(params.instance_url) ||
          nonRedactedString(actionParams.instance_uri) ||
          nonRedactedString(connectorState.destinationConfigs?.[0]?.destinations?.[0]?.host);
        const tenantOrInstanceId =
          nonRedactedString(params.tenant_id) ||
          nonRedactedString(params.instance_id) ||
          nonRedactedString(params.azure_tenant) ||
          nonRedactedString(actionParams.tenant_id) ||
          nonRedactedString(actionParams.azure_tenant) ||
          nonRedactedString(actionParams.instance_id);

        const hasExplicitCredentials = WRITE_ONLY_CREDENTIAL_FIELDS.some(
          (field) =>
            (params[field] !== undefined && params[field] !== null && params[field] !== '') ||
            (actionParams[field] !== undefined &&
              actionParams[field] !== null &&
              actionParams[field] !== '')
        );

        if (isMicrosoft) {
          if (!tenantOrInstanceId && !hostUri) {
            if (connectorState.state === 'ACTIVE' || hasExplicitCredentials) {
              return {
                status: 'pass',
                message:
                  'No OAuth/authentication errors reported by Discovery Engine (note: client_id and client_secret are write-only and redacted by GCP on read and must be attested manually).',
                verificationSource: signals.hasAnyDiagnosticsEnvelope
                  ? 'DIAGNOSTICS_SIGNALS'
                  : 'GCP_API',
                details: { tenantOrInstanceId, hostUri, authType, redactedCredentials },
                executedAt,
              };
            }
            return {
              status: 'warning',
              message:
                'No non-redacted tenant_id or instance_uri found in connector JSON (note: client_id and client_secret are write-only and redacted by GCP on read).',
              remediation:
                'Verify that the Microsoft Entra Directory (tenant) ID and instance URI are configured on the connector.',
              verificationSource: 'GCP_API',
              details: { redactedCredentials },
              executedAt,
            };
          }
          const verifiedParts = [
            tenantOrInstanceId ? `tenant/instance ID: ${tenantOrInstanceId}` : null,
            hostUri ? `endpoint: ${hostUri}` : null,
            authType ? `auth_type: ${authType}` : null,
          ].filter(Boolean);
          return {
            status: 'pass',
            message: `Verified non-redacted connector parameters (${verifiedParts.join(', ')}; note: client_id & client_secret are redacted by GCP on read and must be attested manually).`,
            verificationSource: signals.hasAnyDiagnosticsEnvelope ? 'DIAGNOSTICS_SIGNALS' : 'GCP_API',
            details: { tenantOrInstanceId, hostUri, authType, redactedCredentials },
            executedAt,
          };
        }

        // 6. Standard 3rd-party SaaS connectors:
        // Google Cloud redacts client_id, client_secret, and refresh_token on GET.
        // We verify non-redacted endpoint/entity/action config and active backend auth state.
        const entitiesCount = Array.isArray(connectorState.entities)
          ? connectorState.entities.length
          : 0;
        const verifiedDetails = [
          hostUri ? `endpoint: ${hostUri}` : null,
          tenantOrInstanceId ? `instance ID: ${tenantOrInstanceId}` : null,
          authType ? `auth_type: ${authType}` : null,
          entitiesCount > 0 ? `${entitiesCount} data entities` : null,
          actionConfig.isActionConfigured ? 'actions configured' : null,
        ].filter(Boolean);

        return {
          status: 'pass',
          message:
            verifiedDetails.length > 0
              ? `Verified non-redacted connector config (${verifiedDetails.join(', ')}) with no auth errors (note: client_id, client_secret, and vendor portal scopes are redacted by GCP on read).`
              : `No OAuth/authentication errors reported by Discovery Engine (note: client_id, client_secret, and vendor portal scopes are redacted by GCP on read and must be verified manually).`,
          verificationSource: signals.hasAnyDiagnosticsEnvelope ? 'DIAGNOSTICS_SIGNALS' : 'GCP_API',
          details: { hostUri, tenantOrInstanceId, authType, entitiesCount, redactedCredentials },
          executedAt,
        };
      }

      default:
        return {
          status: 'pass',
          message: 'Probe completed.',
          verificationSource: 'GCP_API',
          executedAt,
        };
    }
  } catch (err: unknown) {
    const errMsg = toErrorMessage(err);
    return {
      status: 'fail',
      message: `Probe execution error: ${errMsg}`,
      remediation: buildRemediationString(errMsg, dataSource),
      verificationSource: 'GCP_API',
      executedAt,
    };
  }
}

export async function runAutomatedProbe(
  probe: ChecklistProbeConfig,
  connector: DataConnector | any,
  config: Config
): Promise<ProbeExecutionResult> {
  return await runProbeSyncOrAsync(probe, connector, config);
}

