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

    // 2. Fetch Recent Operations
    addStep("Fetch Recent Operations", "info", {
      api: `projects.locations.collections.operations.list`,
    });
    let recentOps: Operation[] = [];
    try {
      const operationsResponse = await api.listOperations(collectionConfig);
      recentOps = operationsResponse.operations || [];
      addStep("Fetch Recent Operations", "ok", { count: recentOps.length });
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

    // Analyze recent operations for failures
    const failures = recentOps.filter((op: Operation) => {
      const hasOpError = !!op.error;
      const metadata = op.metadata as { failureCount?: string | number; createTime?: string; updateTime?: string } | undefined;
      const failureCount = metadata?.failureCount
        ? parseInt(String(metadata.failureCount), 10)
        : 0;
      const response = op.response as { errorSamples?: unknown[]; errorConfig?: { gcsPrefix?: string } } | undefined;
      const hasImportErrors =
        failureCount > 0 ||
        (Array.isArray(response?.errorSamples) && response.errorSamples.length > 0);

      const isRecent =
        new Date(
          metadata?.createTime || metadata?.updateTime || Date.now()
        ).getTime() >
        Date.now() - 86400000;
      return (hasOpError || hasImportErrors) && isRecent;
    });

    if (failures.length > 0) {
      status = "error";
      message = `Sync Failures Detected: ${failures.length} failed operations in the last 24h.`;
      diagnostics.errors.push(
        `Found ${failures.length} failed operations in the last 24h.`
      );
      failures.forEach((op: Operation) => {
        const response = op.response as { errorConfig?: { gcsPrefix?: string } } | undefined;
        const errMsg =
          op.error?.message ||
          (response?.errorConfig
            ? `Import errors written to GCS prefix: ${response.errorConfig.gcsPrefix}`
            : "Operation failed");
        addStep(`Operation Failed: ${op.name}`, "fail", errMsg);
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
          const projId = parts[parts.indexOf("projects") + 1];
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
      filter: `severity>=ERROR${mcpEndpointUrl ? " (or Cloud Run severity>=WARNING / status>=400)" : ""} and >= ${duration}h ago`,
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
        addStep("Fetch Recent Error Logs", "fail", {
          count: recentLogs.length,
          latest: recentLogs[0].textPayload || "See Details",
        });
        diagnostics.errors.push(
          `Found ${recentLogs.length} error logs in the last ${duration} hours.`
        );
        status = "error";
        message = `Validation Failed: ${recentLogs.length} Recent Errors`;
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
