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

import { Config, LogEntry, Operation } from "../../types";
import { gapiRequest, getDiscoveryEngineUrl } from "./core";

export interface LoggingSink {
  name: string;
  destination: string;
  filter?: string;
  writerIdentity?: string;
  createTime?: string;
  updateTime?: string;
  [key: string]: unknown;
}

export interface TimeSeriesPoint {
  interval?: {
    startTime?: string;
    endTime?: string;
  };
  value?: {
    int64Value?: string;
    doubleValue?: number;
    stringValue?: string;
    boolValue?: boolean;
    distributionValue?: Record<string, unknown>;
  };
}

export interface TimeSeries {
  metric?: {
    type?: string;
    labels?: Record<string, string>;
  };
  resource?: {
    type?: string;
    labels?: Record<string, string>;
  };
  metricKind?: string;
  valueType?: string;
  points?: TimeSeriesPoint[];
  [key: string]: unknown;
}

export const createLoggingSink = async (
  projectId: string,
  sinkName: string,
  destination: string,
  filter: string,
): Promise<LoggingSink> => {
  const url = `https://logging.googleapis.com/v2/projects/${projectId}/sinks`;
  const body = {
    name: sinkName,
    destination: destination,
    filter: filter,
  };
  const params = { uniqueWriterIdentity: true };
  return gapiRequest<LoggingSink>(url, "POST", projectId, params, body);
};

export const getLoggingSink = async (
  projectId: string,
  sinkName: string,
): Promise<LoggingSink> => {
  const url = `https://logging.googleapis.com/v2/projects/${projectId}/sinks/${sinkName}`;
  return gapiRequest<LoggingSink>(url, "GET", projectId);
};

export const listLoggingSinks = async (
  projectId: string,
): Promise<{ sinks?: LoggingSink[]; nextPageToken?: string }> => {
  const url = `https://logging.googleapis.com/v2/projects/${projectId}/sinks`;
  return gapiRequest<{ sinks?: LoggingSink[]; nextPageToken?: string }>(url, "GET", projectId);
};

export const fetchViolationLogs = async (
  config: Config,
  customFilter: string = "",
): Promise<{ entries?: LogEntry[]; nextPageToken?: string }> => {
  const filter = `resource.type="modelarmor.googleapis.com/SanitizeOperation" ${customFilter ? "AND " + customFilter : ""}`;
  return gapiRequest<{ entries?: LogEntry[]; nextPageToken?: string }>(
    `https://logging.googleapis.com/v2/entries:list`,
    "POST",
    config.projectId,
    undefined,
    {
      resourceNames: [`projects/${config.projectId}`],
      filter: filter,
      orderBy: "timestamp desc",
      pageSize: 50,
    },
  );
};

const extractCloudRunServiceName = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith(".run.app")) return null;
    const subdomains = parsed.hostname.split(".");
    const firstPart = subdomains[0]; // e.g., "oracle-mcp-server-123456789012" or "multi-mcp-vpaohjgvxq-uc"
    const parts = firstPart.split("-");

    if (parts.length <= 1) return firstPart;

    // Check new format: ends with -[10-char-hash]-[region-abbr]
    // e.g. parts = ['multi', 'mcp', 'vpaohjgvxq', 'uc']
    if (parts.length >= 3) {
      const secondToLast = parts[parts.length - 2];
      const lastPart = parts[parts.length - 1];
      const isNewFormat =
        /^[a-z0-9]{10}$/.test(secondToLast) && lastPart.length <= 4;
      if (isNewFormat) {
        parts.splice(-2, 2);
        return parts.join("-");
      }
    }

    // Check old format: ends with -[numeric-project-id-or-hash]
    const lastPart = parts[parts.length - 1];
    if (/^\d+$/.test(lastPart) || lastPart.length >= 8) {
      parts.pop();
    }
    return parts.join("-");
  } catch {
    return null;
  }
};

export const fetchConnectorLogs = async (
  config: Config,
  connectorName: string,
  hoursAgo: number = 24,
  instanceUri?: string,
): Promise<{ entries?: LogEntry[]; nextPageToken?: string }> => {
  const connectorId = connectorName.split("/").pop();
  const startTime = new Date(
    Date.now() - hoursAgo * 60 * 60 * 1000,
  ).toISOString();

  let filter = `((resource.type="vertex_ai_search_connector" AND resource.labels.connector_id="${connectorId}") OR (jsonPayload.connectorRunPayload.dataConnector="${connectorName}")) AND severity>=ERROR`;

  if (instanceUri) {
    const serviceName = extractCloudRunServiceName(instanceUri);
    if (serviceName) {
      filter = `(${filter}) OR (resource.type="cloud_run_revision" AND resource.labels.service_name="${serviceName}" AND (severity>=WARNING OR httpRequest.status>=400))`;
    }
  }

  filter = `(${filter}) AND timestamp>="${startTime}"`;

  return gapiRequest<{ entries?: LogEntry[]; nextPageToken?: string }>(
    `https://logging.googleapis.com/v2/entries:list`,
    "POST",
    config.projectId,
    undefined,
    {
      resourceNames: [`projects/${config.projectId}`],
      filter: filter,
      orderBy: "timestamp desc",
      pageSize: 50,
    },
  );
};

export const fetchLastRunLog = async (
  config: Config,
  serviceName: string,
): Promise<{ entries?: LogEntry[] }> => {
  const filter = `resource.type="cloud_run_revision" AND resource.labels.service_name="${serviceName}"`;
  return gapiRequest<{ entries?: LogEntry[] }>(
    "https://logging.googleapis.com/v2/entries:list",
    "POST",
    config.projectId,
    undefined,
    {
      resourceNames: [`projects/${config.projectId}`],
      filter: filter,
      orderBy: "timestamp desc",
      pageSize: 1,
    },
  );
};

export const exportAnalyticsMetrics = async (
  config: Config,
  datasetId: string,
  tableId: string,
): Promise<Operation> => {
  const { projectId, appLocation, collectionId, appId } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/v1alpha/projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/analytics:exportMetrics`;
  const payload = {
    outputConfig: {
      bigqueryDestination: {
        datasetId: datasetId,
        tableId: tableId,
      },
    },
  };
  // Note: The v1alpha exportMetrics API currently strictly limits to the last 30 days.
  return gapiRequest<Operation>(url, "POST", projectId, undefined, payload);
};

export const getAgentEngineToolLatencies = async (
  config: Config,
  resourceId: string,
  startTime: string,
  endTime: string,
  filterBy: "engine_id" | "tool_id" = "engine_id",
): Promise<{ timeSeries?: TimeSeries[] }> => {
  let filter = "";
  if (filterBy === "engine_id") {
    filter = `metric.type="discoveryengine.googleapis.com/tool_total_latencies" AND resource.labels.engine_id="${resourceId}"`;
  } else {
    filter = `metric.type="discoveryengine.googleapis.com/tool_total_latencies" AND resource.labels.tool_id=has_substring("${resourceId}")`;
  }
  const url = `https://monitoring.googleapis.com/v3/projects/${config.projectId}/timeSeries?filter=${encodeURIComponent(filter)}&interval.startTime=${encodeURIComponent(startTime)}&interval.endTime=${encodeURIComponent(endTime)}`;

  return gapiRequest<{ timeSeries?: TimeSeries[] }>(url, "GET", config.projectId);
};

export const getCloudMonitoringMetrics = async (
  projectId: string,
  metricFilter: string,
  startTime: string,
  endTime: string,
  aligner: string = "ALIGN_SUM",
  alignmentPeriod: string = "86400s",
): Promise<{ timeSeries?: TimeSeries[] }> => {
  const url = `https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries`;

  const params = new URLSearchParams({
    filter: metricFilter,
    "interval.startTime": startTime,
    "interval.endTime": endTime,
    "aggregation.perSeriesAligner": aligner,
    "aggregation.alignmentPeriod": alignmentPeriod,
  });

  return gapiRequest<{ timeSeries?: TimeSeries[] }>(`${url}?${params.toString()}`, "GET", projectId);
};
