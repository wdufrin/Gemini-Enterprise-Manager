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

import { Config, Collection, DataConnector, Operation, LogEntry } from "../../types";
import * as api from "../../services/apiService";
import { toErrorMessage } from "../../utils/errors";

export interface DiagnosticStep {
  name: string;
  status: "ok" | "fail" | "info";
  details?: unknown;
  time: string;
}

export interface ConnectorDiagnostics {
  steps: DiagnosticStep[];
  warnings: string[];
  errors: string[];
}

export interface ConnectorDiagnosticsDetails {
  summary?: string;
  connectorState?: DataConnector | null;
  diagnostics?: ConnectorDiagnostics;
  rawOperations?: Operation[];
  recentLogs?: Array<{
    timestamp?: string;
    severity?: string;
    textPayload?: string;
    jsonPayload?: unknown;
    protoPayload?: unknown;
    httpRequest?: {
      requestMethod?: string;
      status?: number;
      latency?: string;
      requestUrl?: string;
      userAgent?: string;
    };
  }>;
  verification?: Record<string, unknown>;
  error?: string;
  [key: string]: unknown;
}

export interface ValidationResult {
  status: "pending" | "success" | "error" | "n/a" | "unvalidated";
  message?: string;
  details?: ConnectorDiagnosticsDetails | string;
  dataConnector?: DataConnector | null;
}

export async function runConnectorDiagnostics(
  collection: Collection,
  config: Config,
  scanDurationHours: number | "" = 2
): Promise<ValidationResult> {
  const collectionId = collection.name.split("/").pop() || "default_collection";

  if (collectionId === "default_collection") {
    return {
      status: "n/a",
      message: "Not Applicable for Default Connector",
      details: "Default connector does not require validation.",
    };
  }

  const collectionConfig = { ...config, collectionId: collectionId };

  const diagnostics: ConnectorDiagnostics = {
    steps: [],
    warnings: [],
    errors: [],
  };

  const addStep = (
    name: string,
    status: "ok" | "fail" | "info",
    details?: unknown
  ) => {
    diagnostics.steps.push({
      name,
      status,
      details,
      time: new Date().toISOString(),
    });
  };

  try {
    // 1. Get DataConnector
    addStep("Fetch DataConnector", "info", {
      api: `projects.locations.collections.dataConnector.get`,
      collectionId,
    });
    let connector: DataConnector | null = null;
    try {
      connector = await api.getDataConnector(collectionConfig);
      if (connector && connector.state === "FAILED") {
        addStep("Fetch DataConnector", "fail", connector);
      } else if (connector && connector.state === "INACTIVE") {
        addStep("Fetch DataConnector", "info", connector);
      } else {
        addStep("Fetch DataConnector", "ok", connector);
      }
    } catch (e: unknown) {
      addStep("Fetch DataConnector", "fail", toErrorMessage(e));
      throw e; // Stop if we can't even get the connector status
    }

    // 2. Fetch Recent Operations (scoped strictly to this collection/connector)
    addStep("Fetch Recent Operations", "info", {
      api: `projects.locations.collections.operations.list`,
      collectionId,
    });
    let recentOps: Operation[] = [];
    try {
      const operationsResponse = await api.listOperations(collectionConfig);
      const allOps = operationsResponse.operations || [];
      const targetSegment = `collections/${collectionId}`;
      const connectorNameLower = (connector.name || "").toLowerCase();
      recentOps = allOps.filter((op: Operation) => {
        const serialized = `${op.name || ""} ${JSON.stringify(op.metadata || {})} ${JSON.stringify(op.response || {})}`.toLowerCase();
        if (serialized.includes(targetSegment.toLowerCase())) return true;
        if (connectorNameLower && serialized.includes(connectorNameLower)) return true;
        return false;
      });
      addStep("Fetch Recent Operations", "ok", {
        count: recentOps.length,
        totalProjectOperations: allOps.length,
      });
    } catch (e: unknown) {
      addStep("Fetch Recent Operations", "fail", toErrorMessage(e));
      diagnostics.warnings.push(
        "Could not list operations. Diagnostics might be incomplete."
      );
    }

    // 3. Analyze Health
    let status: "success" | "error" = "success";
    let message = "Connector Active";

    if (connector.state === "FAILED") {
      status = "error";
      message = "Connector State: FAILED";
      diagnostics.errors.push(`Connector is in FAILED state.`);
    } else if (connector.state === "INACTIVE") {
      message = `Connector State: ${connector.state}`;
    }

    // Check for Sync Run Errors (Data Plane)
    const latestRunObj = connector.latestRun as
      | { error?: { message?: string }; endTime?: string; startTime?: string; state?: string }
      | undefined;
    const latestHealthyRunTime =
      !latestRunObj?.error && (latestRunObj?.endTime || latestRunObj?.startTime)
        ? new Date(latestRunObj.endTime || latestRunObj.startTime || "").getTime()
        : NaN;

    if (connector.latestRun && connector.latestRun.error) {
      status = "error";
      message = `Sync Error: ${connector.latestRun.error.message || "Unknown Error"}`;
      diagnostics.errors.push(
        `Latest Sync Run Failed: ${JSON.stringify(connector.latestRun.error)}`
      );
    } else if (connector.errorConfig && connector.errorConfig.error) {
      status = "error";
      message = `Connector Error: ${connector.errorConfig.error.message || "Configuration Error"}`;
      diagnostics.errors.push(
        `Connector Error Config: ${JSON.stringify(connector.errorConfig)}`
      );
    }

    // Analyze recent operations for failures (strictly requiring a valid timestamp within last 24h)
    const hardOpFailures: Operation[] = [];
    const partialOpWarnings: Operation[] = [];

    recentOps.forEach((op: Operation) => {
      const hasOpError = !!op.error;
      const metadata = op.metadata as
        | { failureCount?: string | number; createTime?: string; updateTime?: string }
        | undefined;
      const failureCount = metadata?.failureCount
        ? parseInt(String(metadata.failureCount), 10)
        : 0;
      const response = op.response as
        | { errorSamples?: unknown[]; errorConfig?: { gcsPrefix?: string } }
        | undefined;
      const hasImportErrors =
        failureCount > 0 ||
        (Array.isArray(response?.errorSamples) && response.errorSamples.length > 0);

      const rawOpTime = metadata?.updateTime || metadata?.createTime;
      const opTimeMs = rawOpTime ? new Date(rawOpTime).getTime() : NaN;
      const isRecent = !Number.isNaN(opTimeMs) && opTimeMs > Date.now() - 86400000;
      if (!isRecent) return;

      const resolvedByNewerRun =
        connector.state === "ACTIVE" &&
        !Number.isNaN(latestHealthyRunTime) &&
        opTimeMs < latestHealthyRunTime;

      if (hasOpError && !resolvedByNewerRun) {
        hardOpFailures.push(op);
      } else if (hasOpError || hasImportErrors) {
        partialOpWarnings.push(op);
      }
    });

    if (hardOpFailures.length > 0) {
      status = "error";
      message = `Sync Failures Detected: ${hardOpFailures.length} failed operations in the last 24h.`;
      diagnostics.errors.push(
        `Found ${hardOpFailures.length} failed operations in the last 24h.`
      );
      hardOpFailures.forEach((op: Operation) => {
        const response = op.response as { errorConfig?: { gcsPrefix?: string } } | undefined;
        const errMsg =
          op.error?.message ||
          (response?.errorConfig
            ? `Import errors written to GCS prefix: ${response.errorConfig.gcsPrefix}`
            : "Operation failed");
        addStep(`Operation Failed: ${op.name}`, "fail", errMsg);
      });
    }

    if (partialOpWarnings.length > 0) {
      diagnostics.warnings.push(
        `Found ${partialOpWarnings.length} historical or partial-import operation warning(s) in the last 24h (connector is currently ${connector.state || "ACTIVE"}).`
      );
      partialOpWarnings.forEach((op: Operation) => {
        const response = op.response as { errorConfig?: { gcsPrefix?: string } } | undefined;
        const warnMsg =
          op.error?.message ||
          (response?.errorConfig
            ? `Partial import errors logged to GCS: ${response.errorConfig.gcsPrefix}`
            : "Operation completed with item-level warnings");
        addStep(`Operation Warning: ${op.name}`, "info", warnMsg);
      });
    }

    // 4. Live MCP Endpoint Connectivity Verification
    const params = connector.params as Record<string, unknown> | undefined;
    const actionConfig = connector.actionConfig as Record<string, unknown> | undefined;
    const actionParams = actionConfig?.actionParams as Record<string, unknown> | undefined;
    const mcpEndpointUrl =
      (typeof params?.instance_uri === 'string' ? params.instance_uri : undefined) ||
      (typeof actionParams?.instance_uri === 'string' ? actionParams.instance_uri : undefined);

    if (connector && connector.dataSource === "custom_mcp") {
      if (mcpEndpointUrl) {
        addStep("Verify MCP Connectivity", "info", { url: mcpEndpointUrl });
        try {
          const parts = (connector.name || "").split("/");
          const projId = parts[parts.indexOf("projects") + 1] || collectionConfig.projectId;
          const tools = await api.listMcpTools(projId, mcpEndpointUrl);
          if (!tools || tools.length === 0) {
            addStep(
              "Verify MCP Connectivity",
              "fail",
              "No tools returned by MCP server."
            );
            status = "error";
            message = "MCP Server returned empty tools list";
          } else {
            addStep("Verify MCP Connectivity", "ok", {
              toolsCount: tools.length,
            });
          }
        } catch (e: unknown) {
          const errText = toErrorMessage(e);
          addStep(
            "Verify MCP Connectivity",
            "fail",
            errText || "Failed to connect to MCP endpoint"
          );
          status = "error";
          message = `MCP Connectivity Failed: ${errText || "Failed to fetch"}`;
        }
      }
    }

    // 5. Fetch Recent Error Logs
    const duration = typeof scanDurationHours === "number" ? scanDurationHours : 2;
    addStep("Fetch Recent Error Logs", "info", {
      filter: `severity>=ERROR${mcpEndpointUrl ? " (or Cloud Run status>=500)" : ""} and >= ${duration}h ago`,
    });
    let recentLogs: LogEntry[] = [];
    try {
      const logsResponse = await api.fetchConnectorLogs(
        collectionConfig,
        connector.name || "",
        duration,
        mcpEndpointUrl
      );
      recentLogs = logsResponse.entries || [];
      if (recentLogs.length > 0) {
        const latestLogTimeMs = recentLogs[0]?.timestamp
          ? new Date(recentLogs[0].timestamp).getTime()
          : NaN;
        const resolvedAfterLog =
          connector.state === "ACTIVE" &&
          !connector.latestRun?.error &&
          !Number.isNaN(latestHealthyRunTime) &&
          !Number.isNaN(latestLogTimeMs) &&
          latestLogTimeMs < latestHealthyRunTime;

        if (resolvedAfterLog) {
          addStep("Fetch Recent Error Logs", "info", {
            count: recentLogs.length,
            note: "Earlier errors resolved by latest successful sync run",
          });
          diagnostics.warnings.push(
            `Found ${recentLogs.length} historical error log(s) in the last ${duration}h prior to the latest successful sync.`
          );
        } else if (connector.state === "ACTIVE" && !connector.latestRun?.error && !connector.errorConfig?.error) {
          addStep("Fetch Recent Error Logs", "info", {
            count: recentLogs.length,
            latest: recentLogs[0].textPayload || "See Details",
          });
          diagnostics.warnings.push(
            `Found ${recentLogs.length} error log entry(s) in the last ${duration}h while connector state is ACTIVE.`
          );
        } else {
          addStep("Fetch Recent Error Logs", "fail", {
            count: recentLogs.length,
            latest: recentLogs[0].textPayload || "See Details",
          });
          diagnostics.errors.push(
            `Found ${recentLogs.length} error logs in the last ${duration} hours.`
          );
          status = "error";
          message = `Validation Failed: ${recentLogs.length} Recent Errors`;
        }
      } else {
        addStep("Fetch Recent Error Logs", "ok", { count: 0 });
      }
    } catch (e: unknown) {
      addStep("Fetch Recent Error Logs", "fail", toErrorMessage(e));
      diagnostics.warnings.push("Could not fetch Cloud Logging entries.");
    }

    return {
      status,
      message,
      dataConnector: connector,
      details: {
        summary: message,
        connectorState: connector,
        diagnostics,
        rawOperations: recentOps.slice(0, 5),
        recentLogs,
      },
    };
  } catch (err: unknown) {
    const errText = toErrorMessage(err);
    return {
      status: "error",
      message: `Check Failed: ${errText}`,
      details: {
        error: errText,
        diagnostics,
      },
    };
  }
}

export interface RemediationGuidance {
  title: string;
  message: string;
  steps: string[];
  targetPortal: "GCP" | "VENDOR" | "BOTH";
  severity: "error" | "warning";
  targetSurface: string;
}

/**
 * Derives actionable, vendor-aware remediation steps from a raw error string
 * or a full ConnectorDiagnosticsDetails object.
 */
export function deriveConnectorRemediation(
  errorOrDetails:
    | string
    | ConnectorDiagnosticsDetails
    | Record<string, unknown>
    | null
    | undefined,
  dataSource?: string
): RemediationGuidance | null {
  if (!errorOrDetails) return null;

  let allText = "";
  let ds = (dataSource || "").toLowerCase();
  let hasErrors = false;
  let hasWarnings = false;

  if (typeof errorOrDetails === "string") {
    const trimmed = errorOrDetails.trim();
    if (!trimmed) return null;
    allText = trimmed;
    hasErrors = true;
  } else if (typeof errorOrDetails === "object") {
    const data = errorOrDetails as ConnectorDiagnosticsDetails;
    const conn =
      data.connectorState ||
      (data.dataConnector as DataConnector | undefined) ||
      (data as unknown as DataConnector);
    if (!ds && typeof conn?.dataSource === "string") {
      ds = conn.dataSource.toLowerCase();
    }

    const latestRunObj = conn?.latestRun as
      | { error?: { message?: string }; endTime?: string; startTime?: string }
      | undefined;
    const latestHealthyRunTime =
      !latestRunObj?.error && (latestRunObj?.endTime || latestRunObj?.startTime)
        ? new Date(latestRunObj.endTime || latestRunObj.startTime || "").getTime()
        : NaN;

    const errors: string[] = [
      ...(data.diagnostics?.errors || []),
      ...(data.error ? [String(data.error)] : []),
      ...(conn?.latestRun?.error?.message ? [conn.latestRun.error.message] : []),
      ...(conn?.errorConfig?.error?.message ? [conn.errorConfig.error.message] : []),
    ];
    const warnings: string[] = [...(data.diagnostics?.warnings || [])];

    const rawOps = Array.isArray(data.rawOperations) ? data.rawOperations : [];
    for (const op of rawOps) {
      if (!op) continue;
      const metadata = op.metadata as
        | { failureCount?: string | number; createTime?: string; updateTime?: string }
        | undefined;
      const rawOpTime = metadata?.updateTime || metadata?.createTime;
      const opTimeMs = rawOpTime ? new Date(rawOpTime).getTime() : NaN;
      const isRecent = !Number.isNaN(opTimeMs) && opTimeMs > Date.now() - 86400000;
      if (!isRecent) continue;

      const resolvedByNewerRun =
        conn?.state === "ACTIVE" &&
        !Number.isNaN(latestHealthyRunTime) &&
        opTimeMs < latestHealthyRunTime;

      if (op.error?.message) {
        if (resolvedByNewerRun) {
          warnings.push(op.error.message);
        } else {
          errors.push(op.error.message);
        }
      } else {
        const failureCount = metadata?.failureCount
          ? parseInt(String(metadata.failureCount), 10)
          : 0;
        const response = op.response as { errorSamples?: unknown[] } | undefined;
        const hasImportErrors =
          failureCount > 0 ||
          (Array.isArray(response?.errorSamples) && response.errorSamples.length > 0);
        if (hasImportErrors) {
          warnings.push("Partial import warnings detected in recent operation");
        }
      }
    }

    const recentLogs = Array.isArray(data.recentLogs) ? data.recentLogs : [];
    for (const l of recentLogs) {
      if (!l) continue;
      const snippet = [
        typeof l.textPayload === "string" ? l.textPayload : "",
        l.jsonPayload ? JSON.stringify(l.jsonPayload) : "",
        l.protoPayload ? JSON.stringify(l.protoPayload) : "",
      ]
        .filter(Boolean)
        .join(" ")
        .trim();
      if (!snippet) continue;

      const logTimeMs = l.timestamp ? new Date(l.timestamp).getTime() : NaN;
      const resolvedByNewerRun =
        conn?.state === "ACTIVE" &&
        !conn?.latestRun?.error &&
        !Number.isNaN(latestHealthyRunTime) &&
        !Number.isNaN(logTimeMs) &&
        logTimeMs < latestHealthyRunTime;
      const activeWithoutDirectError =
        conn?.state === "ACTIVE" && !conn?.latestRun?.error && !conn?.errorConfig?.error;

      if (resolvedByNewerRun || activeWithoutDirectError) {
        warnings.push(snippet);
      } else {
        errors.push(snippet);
      }
    }

    hasErrors = errors.length > 0 || conn?.state === "FAILED";
    hasWarnings = warnings.length > 0;

    if (!hasErrors && !hasWarnings) {
      return null;
    }

    allText = [data.summary || "", ...errors, ...warnings]
      .join(" ")
      .trim();
  }

  if (!allText && !hasErrors && !hasWarnings) return null;

  const effectiveSeverity: "error" | "warning" = hasErrors ? "error" : "warning";

  // 1. Microsoft Entra ID / M365 specific errors
  if (/AADSTS700016|Application with identifier|was not found in the directory/i.test(allText)) {
    return {
      severity: effectiveSeverity,
      title: "Entra ID Tenant / Client ID Mismatch (AADSTS700016)",
      targetPortal: "BOTH",
      targetSurface: "Microsoft Entra Admin Center & Discovery Engine OAuth Config",
      message:
        "The configured OAuth Application (Client) ID was not found in the target Microsoft Entra directory tenant.",
      steps: [
        "Open Microsoft Entra Admin Center > Identity > Applications > App registrations.",
        "Verify the Application (client) ID and Directory (tenant) ID match the values configured on the Gemini Enterprise connector.",
        "Ensure the app registration is registered in the target tenant or configured as Multi-tenant.",
      ],
    };
  }

  if (/AADSTS65001|user or administrator has not consented|admin_consent/i.test(allText)) {
    return {
      severity: effectiveSeverity,
      title: "Missing Entra ID Admin Consent (AADSTS65001)",
      targetPortal: "VENDOR",
      targetSurface: "Microsoft Entra ID > App Registrations > API Permissions",
      message:
        "A Global Administrator must grant tenant-wide admin consent for the required Microsoft Graph permissions.",
      steps: [
        "Open Microsoft Entra Admin Center > App registrations > Select your connector app > API permissions.",
        "Verify all required Microsoft Graph Application and Delegated scopes are added.",
        'Click "Grant admin consent for [Tenant]" and confirm all status badges turn green.',
      ],
    };
  }

  if (/AADSTS7000215|Invalid client secret|client_secret.*expired/i.test(allText)) {
    return {
      severity: effectiveSeverity,
      title: "Expired or Invalid OAuth Client Secret",
      targetPortal: "BOTH",
      targetSurface: "3rd-Party Vendor Developer Portal & GCP Connector Credentials",
      message:
        "The OAuth client secret was rejected. Note: ensure you copied the Secret Value (not the Secret ID UUID) if using Microsoft Entra ID.",
      steps: [
        "Generate a new Client Secret in your 3rd-party vendor developer portal (e.g., Entra ID Certificates & secrets).",
        "Copy the Secret Value (never the Secret ID).",
        "Update the connector credentials in Google Cloud and re-trigger synchronization.",
      ],
    };
  }

  // 2. OAuth Grant / Refresh Token / Redirect URI errors
  if (/invalid_grant|token has been expired or revoked|refresh_token/i.test(allText)) {
    return {
      severity: effectiveSeverity,
      title: "OAuth Refresh Token Expired or Revoked (invalid_grant)",
      targetPortal: "BOTH",
      targetSurface: "3rd-Party OAuth Consent & GCP Connector Authorization",
      message:
        "The stored OAuth refresh token is no longer valid or the authorizing user lost access in the source platform.",
      steps: [
        "Confirm the integration service account remains active and licensed in the 3rd-party vendor portal.",
        "Check Refresh Token inactivity / session lifetime policies in the vendor portal (e.g., Salesforce Setup > Connected Apps > Refresh Token Policy).",
        "Re-authorize the OAuth handshake in Google Cloud Console to issue a fresh refresh token.",
      ],
    };
  }

  if (/redirect_uri_mismatch|redirect_uri/i.test(allText)) {
    return {
      severity: effectiveSeverity,
      title: "OAuth Redirect URI Mismatch",
      targetPortal: "VENDOR",
      targetSurface: "3rd-Party OAuth App Registration Redirect URIs",
      message:
        "The OAuth callback URL sent by Discovery Engine is not allowlisted in your 3rd-party OAuth client registration.",
      steps: [
        "Add https://vertexaisearch.cloud.google.com/console/oauth/default_oauth.html for standard ingestion/federated connectors.",
        "Add https://vertexaisearch.cloud.google.com/oauth-redirect if Assistant Actions (3LO user-level OAuth) are enabled.",
        "Save the OAuth application settings in the vendor portal and retry authorization.",
      ],
    };
  }

  // 3. ServiceNow Table ACL / Role errors
  if (
    /snc_read_only|sys_db_object|insufficient rights/i.test(allText) ||
    (ds.includes("servicenow") && /403|acl|forbidden|unauthorized/i.test(allText))
  ) {
    return {
      severity: effectiveSeverity,
      title: "ServiceNow Table ACL or Role Restriction",
      targetPortal: "VENDOR",
      targetSurface: "ServiceNow System Security > Access Control (ACL)",
      message:
        "The ServiceNow integration user lacks read access to required metadata or knowledge/incident tables.",
      steps: [
        "In ServiceNow User Administration > Users, verify the integration account has roles such as itil, knowledge, knowledge_admin, or snc_read_only.",
        "In System Security > Access Control (ACL), verify Read ACLs exist on sys_db_object, sys_dictionary, kb_knowledge, kb_uc, sc_cat_item, and user_criteria.",
        "Ensure the integration account is not marked Web service access only if interactive OAuth consent is required.",
      ],
    };
  }

  // 4. Salesforce Connected App / Profile restrictions
  if (
    /API_DISABLED_FOR_ORG|ip restricted|sf_oauth/i.test(allText) ||
    (ds.includes("salesforce") && /403|invalid_client|forbidden/i.test(allText))
  ) {
    return {
      severity: effectiveSeverity,
      title: "Salesforce Connected App or Profile Restriction",
      targetPortal: "VENDOR",
      targetSurface: "Salesforce Setup > App Manager & Profiles",
      message:
        "Salesforce rejected the API or OAuth request due to Connected App OAuth policies, IP restrictions, or missing Profile permissions.",
      steps: [
        "In Salesforce Setup > App Manager > Manage Connected Apps, set IP Relaxation to 'Relax IP restrictions' or allowlist Google Cloud egress IPs.",
        "Ensure 'Perform requests at any time (refresh_token, offline_access)' and 'Manage user data via APIs (api)' OAuth scopes are selected.",
        "Verify the integration user's Profile has 'API Enabled' and 'View All Data' (or object-level Read permissions).",
      ],
    };
  }

  // 5. Atlassian Jira / Confluence 3LO Scope errors
  if (
    (ds.includes("jira") || ds.includes("confluence")) &&
    /401|403|scope|browse_projects|unauthorized|forbidden/i.test(allText)
  ) {
    return {
      severity: effectiveSeverity,
      title: "Atlassian OAuth 2.0 (3LO) Scope or Site Permission Error",
      targetPortal: "VENDOR",
      targetSurface: "Atlassian Developer Console > OAuth 2.0 (3LO) Scopes",
      message:
        "Atlassian Cloud rejected the request due to missing granular OAuth 2.0 scopes or project/space permission schemes.",
      steps: [
        "Open developer.atlassian.com/console/myapps > Select your OAuth 2.0 (3LO) app > Permissions.",
        "Ensure granular scopes (e.g., read:jira-work, read:jira-user, or read:confluence-content.all) and Rotating Refresh Tokens are enabled.",
        "Verify the authorizing account has Browse Projects / View Space permissions in the target Atlassian site.",
      ],
    };
  }

  // 6. Google Cloud IAM Service Agent permissions
  if (
    /storage\.objects|bigquery\.|cloudsql\.|spanner\.|alloydb\.|bigtable\.|datastore\.|IAM_PERMISSION_DENIED|caller does not have permission|discoveryengine\.serviceAgent/i.test(
      allText
    )
  ) {
    return {
      severity: effectiveSeverity,
      title: "Missing Google Cloud IAM Service Agent Permissions",
      targetPortal: "GCP",
      targetSurface: "Google Cloud Console > IAM & Admin > IAM",
      message:
        "The Discovery Engine Service Agent (service-{PROJECT_NUMBER}@gcp-sa-discoveryengine.iam.gserviceaccount.com) is missing required IAM roles.",
      steps: [
        "Open Google Cloud Console > IAM & Admin > IAM and check 'Include Google-provided role grants'.",
        "Locate service-{PROJECT_NUMBER}@gcp-sa-discoveryengine.iam.gserviceaccount.com.",
        "Grant roles/discoveryengine.serviceAgent along with the data-source specific reader role (e.g., BigQuery Data Viewer + Job User, Storage Object Viewer, or Cloud SQL Client).",
      ],
    };
  }

  // 7. BYOMCP / Cloud Run MCP connectivity errors
  if (
    /No tools returned by MCP server|Verify MCP Connectivity|MCP Connectivity Failed|tools\/list/i.test(
      allText
    ) ||
    (ds === "custom_mcp" && /500|502|503|401|403|failed|error/i.test(allText))
  ) {
    return {
      severity: effectiveSeverity,
      title: "MCP Server Connectivity or Cloud Run Invoker Failure",
      targetPortal: "GCP",
      targetSurface: "Cloud Run Service & MCP Endpoint Configuration",
      message:
        "Discovery Engine could not complete the JSON-RPC tools/list handshake with the configured MCP server endpoint.",
      steps: [
        "Verify the MCP instance_uri points to a live HTTPS endpoint accepting JSON-RPC 2.0 POST requests.",
        "If hosted on Cloud Run with IAM authentication, grant roles/run.invoker to the Discovery Engine service agent.",
        "Test the endpoint using the 'Run All Automated Probes' button in the Validation Checklist tab.",
      ],
    };
  }

  // 8. Generic HTTP 401 / 403 / 429 patterns
  if (/401|UNAUTHENTICATED|Unauthorized|invalid_client/i.test(allText)) {
    return {
      severity: effectiveSeverity,
      title: "Authentication Rejected (401 Unauthorized)",
      targetPortal: "BOTH",
      targetSurface: "3rd-Party Identity Provider & GCP Connector Auth Config",
      message:
        "The remote data source rejected the connector credentials. The OAuth client secret, API token, or service account key may be invalid.",
      steps: [
        "Verify the Client ID, Client Secret, or API Token in the 3rd-party vendor portal.",
        "Re-authenticate the connector in Google Cloud Console to refresh the stored OAuth token.",
        "Open the Validation Checklist tab to inspect vendor-specific authentication requirements.",
      ],
    };
  }

  if (/403|PERMISSION_DENIED|Forbidden|insufficient_scope/i.test(allText)) {
    return {
      severity: effectiveSeverity,
      title: "Insufficient Permissions or API Scopes (403 Forbidden)",
      targetPortal: "VENDOR",
      targetSurface: "3rd-Party API Scopes & Service Account ACLs",
      message:
        "The connector authenticated successfully, but lacks permission to read target objects, tables, or ACLs.",
      steps: [
        "Open the Validation Checklist tab and verify every required OAuth scope and table ACL for this connector.",
        "Confirm IP allowlisting or conditional access policies in the 3rd-party tenant are not blocking Google Cloud egress IPs.",
        "If Google Cloud resources are involved, run the automated IAM permission probe in the Validation Checklist tab.",
      ],
    };
  }

  if (/429|RESOURCE_EXHAUSTED|rate limit|quota/i.test(allText)) {
    return {
      severity: "warning",
      title: "API Rate Limit or Quota Exhausted (429)",
      targetPortal: "BOTH",
      targetSurface: "Vendor API Rate Limits & GCP Quotas",
      message:
        "Synchronization was throttled by the source platform or Google Cloud API quota limits.",
      steps: [
        "Check concurrent API request limits in the 3rd-party admin portal.",
        "Stagger full sync schedules across collections or request a quota increase.",
      ],
    };
  }

  // 9. Fallback for structured diagnostics with errors/warnings
  if (hasErrors || hasWarnings) {
    return {
      severity: hasErrors ? "error" : "warning",
      title: hasErrors
        ? "Connector Synchronization Issue Detected"
        : "Historical Sync Warnings Detected",
      targetPortal: "BOTH",
      targetSurface: "Validation Checklist & Cloud Logging",
      message: hasErrors
        ? "Recent sync operations or error logs indicate an active issue. Review the Operations and Logs sections below alongside the Validation Checklist."
        : "The connector is currently ACTIVE, though earlier operations or logs recorded warnings prior to the latest healthy sync.",
      steps: [
        "Inspect the Recent Operations and Recent Error Logs sections below for the exact API failure payload.",
        "Switch to the Validation Checklist tab to verify automated Google Cloud API probes and manual 3rd-party vendor prerequisites.",
      ],
    };
  }

  return null;
}

