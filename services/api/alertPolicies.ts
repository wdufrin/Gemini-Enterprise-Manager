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

import { gapiRequest } from "./core";

export interface NotificationChannel {
  name: string;
  type: string;
  displayName?: string;
  description?: string;
  labels?: Record<string, string>;
  enabled?: boolean;
  verificationStatus?: string;
}

export interface AlertConditionMatchedLog {
  filter: string;
  labelExtractors?: Record<string, string>;
}

export interface AlertConditionThreshold {
  filter: string;
  comparison:
    | "COMPARISON_GT"
    | "COMPARISON_GE"
    | "COMPARISON_LT"
    | "COMPARISON_LE"
    | "COMPARISON_EQ"
    | "COMPARISON_NE";
  thresholdValue: number;
  duration: string;
  aggregations?: Array<{
    alignmentPeriod: string;
    perSeriesAligner?: string;
    crossSeriesReducer?: string;
    groupByFields?: string[];
  }>;
  trigger?: {
    count?: number;
    percent?: number;
  };
}

export interface AlertPolicyCondition {
  name?: string;
  displayName: string;
  conditionMatchedLog?: AlertConditionMatchedLog;
  conditionThreshold?: AlertConditionThreshold;
}

export interface AlertPolicyPayload {
  displayName: string;
  documentation?: {
    content: string;
    mimeType?: string;
  };
  userLabels?: Record<string, string>;
  conditions: AlertPolicyCondition[];
  combiner: "OR" | "AND" | "AND_WITH_MATCHING_RESOURCE";
  enabled?: boolean;
  notificationChannels?: string[];
  alertStrategy?: {
    notificationRateLimit?: {
      period: string;
    };
    autoClose?: string;
  };
  severity?: "CRITICAL" | "ERROR" | "WARNING";
}

export interface AlertPolicy extends AlertPolicyPayload {
  name: string;
  creationRecord?: {
    mutateTime?: string;
    mutatedBy?: string;
  };
  mutationRecord?: {
    mutateTime?: string;
    mutatedBy?: string;
  };
}

const VALID_PROJECT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,62}$/;
const VALID_COLLECTION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const VALID_NOTIFICATION_CHANNEL_PATTERN =
  /^projects\/[a-zA-Z0-9._:-]+\/notificationChannels\/[a-zA-Z0-9._-]+$/;
const VALID_ALERT_POLICY_NAME_PATTERN =
  /^projects\/[a-zA-Z0-9._:-]+\/alertPolicies\/[a-zA-Z0-9._-]+$/;

export function assertValidMonitoringProjectId(projectId: string): string {
  const trimmed = typeof projectId === "string" ? projectId.trim() : "";
  if (!trimmed || !VALID_PROJECT_ID_PATTERN.test(trimmed)) {
    throw new Error(
      `Invalid Google Cloud Project ID or Number: "${projectId}". Expected alphanumeric identifier without path separators or whitespace.`,
    );
  }
  return trimmed;
}

export function validateNotificationChannels(channels: string[]): string[] {
  const normalized: string[] = [];
  for (const raw of channels) {
    const ch = typeof raw === "string" ? raw.trim() : "";
    if (!ch) continue;
    if (!VALID_NOTIFICATION_CHANNEL_PATTERN.test(ch)) {
      throw new Error(
        `Invalid Cloud Monitoring notification channel resource name: "${raw}". Expected "projects/{project}/notificationChannels/{channelId}".`,
      );
    }
    if (!normalized.includes(ch)) {
      normalized.push(ch);
    }
  }
  return normalized;
}

export const listAlertPolicies = async (
  projectId: string,
  filter?: string,
): Promise<AlertPolicy[]> => {
  const cleanProject = assertValidMonitoringProjectId(projectId);
  const allPolicies: AlertPolicy[] = [];
  let pageToken: string | undefined;

  do {
    const query = new URLSearchParams({ pageSize: "100" });
    if (filter && filter.trim()) {
      query.set("filter", filter.trim());
    }
    if (pageToken) {
      query.set("pageToken", pageToken);
    }
    const url = `https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(cleanProject)}/alertPolicies?${query.toString()}`;
    const res = await gapiRequest<{
      alertPolicies?: AlertPolicy[];
      nextPageToken?: string;
    }>(url, "GET", cleanProject);
    if (Array.isArray(res?.alertPolicies)) {
      allPolicies.push(...res.alertPolicies);
    }
    pageToken = res?.nextPageToken;
  } while (pageToken);

  return allPolicies;
};

export const listNotificationChannels = async (
  projectId: string,
): Promise<NotificationChannel[]> => {
  const cleanProject = assertValidMonitoringProjectId(projectId);
  const allChannels: NotificationChannel[] = [];
  let pageToken: string | undefined;

  do {
    const query = new URLSearchParams({ pageSize: "100" });
    if (pageToken) {
      query.set("pageToken", pageToken);
    }
    const url = `https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(cleanProject)}/notificationChannels?${query.toString()}`;
    const res = await gapiRequest<{
      notificationChannels?: NotificationChannel[];
      nextPageToken?: string;
    }>(url, "GET", cleanProject);
    if (Array.isArray(res?.notificationChannels)) {
      allChannels.push(...res.notificationChannels);
    }
    pageToken = res?.nextPageToken;
  } while (pageToken);

  return allChannels;
};

export const createAlertPolicy = async (
  projectId: string,
  policy: AlertPolicyPayload,
): Promise<AlertPolicy> => {
  const cleanProject = assertValidMonitoringProjectId(projectId);
  if (!policy || typeof policy !== "object") {
    throw new Error("Alert policy payload is required.");
  }
  const displayName = typeof policy.displayName === "string" ? policy.displayName.trim() : "";
  if (!displayName) {
    throw new Error("Alert policy displayName is required.");
  }
  if (!Array.isArray(policy.conditions) || policy.conditions.length === 0) {
    throw new Error("Alert policy must include at least one condition.");
  }
  for (const cond of policy.conditions) {
    if (!cond.conditionMatchedLog && !cond.conditionThreshold) {
      throw new Error(
        `Condition "${cond.displayName || "(unnamed)"}" must define either conditionMatchedLog or conditionThreshold.`,
      );
    }
    if (cond.conditionMatchedLog && !cond.conditionMatchedLog.filter?.trim()) {
      throw new Error(
        `Log-match condition "${cond.displayName || "(unnamed)"}" requires a non-empty Cloud Logging filter.`,
      );
    }
    if (cond.conditionThreshold) {
      if (!cond.conditionThreshold.filter?.trim()) {
        throw new Error(
          `Metric threshold condition "${cond.displayName || "(unnamed)"}" requires a non-empty metric filter.`,
        );
      }
      if (
        !Number.isFinite(cond.conditionThreshold.thresholdValue) ||
        cond.conditionThreshold.thresholdValue < 0
      ) {
        throw new Error(
          `Metric threshold condition "${cond.displayName || "(unnamed)"}" requires a non-negative finite thresholdValue.`,
        );
      }
    }
  }

  const validatedChannels = policy.notificationChannels
    ? validateNotificationChannels(policy.notificationChannels)
    : [];

  const sanitizedPayload: AlertPolicyPayload = {
    ...policy,
    displayName,
    notificationChannels: validatedChannels,
  };

  const url = `https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(cleanProject)}/alertPolicies`;
  return gapiRequest<AlertPolicy>(url, "POST", cleanProject, undefined, sanitizedPayload);
};

export const deleteAlertPolicy = async (
  projectId: string,
  policyName: string,
): Promise<void> => {
  const cleanProject = assertValidMonitoringProjectId(projectId);
  const trimmedName = typeof policyName === "string" ? policyName.trim() : "";
  if (!VALID_ALERT_POLICY_NAME_PATTERN.test(trimmedName)) {
    throw new Error(
      `Invalid alert policy resource name: "${policyName}". Expected "projects/{project}/alertPolicies/{policyId}".`,
    );
  }
  const url = `https://monitoring.googleapis.com/v3/${trimmedName}`;
  await gapiRequest<Record<string, never>>(url, "DELETE", cleanProject);
};

export interface BuildConnectorSyncAlertOptions {
  projectId: string;
  collectionId?: string;
  collectionDisplayName?: string;
  notificationChannels?: string[];
  rateLimitSeconds?: number;
  autoCloseSeconds?: number;
}

export function buildConnectorSyncFailureAlertPolicy(
  options: BuildConnectorSyncAlertOptions,
): AlertPolicyPayload {
  const cleanProject = assertValidMonitoringProjectId(options.projectId);
  const rawColId = options.collectionId?.trim() || "";
  if (rawColId && !VALID_COLLECTION_ID_PATTERN.test(rawColId)) {
    throw new Error(
      `Invalid connector collectionId "${rawColId}": only alphanumeric characters, hyphens, and underscores are permitted.`,
    );
  }

  const rateLimit = Math.max(300, Math.floor(options.rateLimitSeconds ?? 900));
  const autoClose = Math.max(1800, Math.floor(options.autoCloseSeconds ?? 86400));
  const channels = validateNotificationChannels(options.notificationChannels || []);

  const logFilter = rawColId
    ? `((resource.type="vertex_ai_search_connector" AND resource.labels.connector_id="${rawColId}") OR (jsonPayload.connectorRunPayload.dataConnector:"/collections/${rawColId}/dataConnector")) AND severity>=ERROR`
    : `(resource.type="vertex_ai_search_connector" OR jsonPayload.connectorRunPayload.dataConnector!="") AND severity>=ERROR`;

  const scopeTitle = rawColId
    ? `${options.collectionDisplayName || rawColId} (${rawColId})`
    : `All Connectors (${cleanProject})`;

  return {
    displayName: `[Gemini Enterprise] DataConnector Sync Failure - ${rawColId || "All Collections"}`,
    combiner: "OR",
    enabled: true,
    severity: "ERROR",
    userLabels: {
      managed_by: "gemini_enterprise_manager",
      alert_category: "connector_sync_failure",
      ...(rawColId ? { collection_id: rawColId.toLowerCase().slice(0, 63) } : {}),
    },
    documentation: {
      mimeType: "text/markdown",
      content: [
        `### Discovery Engine DataConnector Sync Failure (${scopeTitle})`,
        "",
        "A Discovery Engine connector synchronization run emitted an `ERROR` or `CRITICAL` log entry.",
        "",
        "**Recommended Triage Steps:**",
        "1. Open **Gemini Enterprise Manager > Connectors** and run live diagnostics on the affected collection.",
        "2. Inspect **GCS Dead-Letter Inspector** (`errorConfig.gcsPrefix`) if item-level document import errors were recorded.",
        "3. Verify OAuth client secrets, refresh tokens, or Discovery Engine Service Agent IAM bindings.",
      ].join("\n"),
    },
    conditions: [
      {
        displayName: rawColId
          ? `DataConnector sync error in ${rawColId}`
          : "Discovery Engine DataConnector sync error",
        conditionMatchedLog: {
          filter: logFilter,
        },
      },
    ],
    notificationChannels: channels,
    alertStrategy: {
      notificationRateLimit: {
        period: `${rateLimit}s`,
      },
      autoClose: `${autoClose}s`,
    },
  };
}

export interface BuildQuotaAlertOptions {
  projectId: string;
  dailyRequestThreshold: number;
  alignmentPeriodSeconds?: number;
  notificationChannels?: string[];
}

export function buildQuotaThresholdAlertPolicy(
  options: BuildQuotaAlertOptions,
): AlertPolicyPayload {
  const cleanProject = assertValidMonitoringProjectId(options.projectId);
  if (
    !Number.isFinite(options.dailyRequestThreshold) ||
    options.dailyRequestThreshold <= 0
  ) {
    throw new Error(
      "Daily quota request threshold must be a positive finite number.",
    );
  }

  const alignmentSeconds = Math.max(
    300,
    Math.floor(options.alignmentPeriodSeconds ?? 86400),
  );
  const channels = validateNotificationChannels(options.notificationChannels || []);

  return {
    displayName: `[Gemini Enterprise] Discovery Engine Quota Threshold (> ${options.dailyRequestThreshold.toLocaleString("en-US")})`,
    combiner: "OR",
    enabled: true,
    severity: "WARNING",
    userLabels: {
      managed_by: "gemini_enterprise_manager",
      alert_category: "discovery_quota_threshold",
    },
    documentation: {
      mimeType: "text/markdown",
      content: [
        `### Discovery Engine Quota Usage Breach (${cleanProject})`,
        "",
        `Discovery Engine net quota usage exceeded **${options.dailyRequestThreshold.toLocaleString("en-US")}** requests within the ${alignmentSeconds}s alignment window.`,
        "",
        "**Recommended Triage Steps:**",
        "1. Open **Gemini Enterprise Manager > Quota & Cost Estimator** to inspect per-metric consumption.",
        "2. Stagger full connector sync intervals (`refreshInterval`) across large collections or request a GCP quota increase.",
      ].join("\n"),
    },
    conditions: [
      {
        displayName: `Discovery Engine quota net usage > ${options.dailyRequestThreshold}`,
        conditionThreshold: {
          filter:
            'metric.type="serviceruntime.googleapis.com/quota/rate/net_usage" AND resource.type="consumer_quota" AND resource.labels.service="discoveryengine.googleapis.com"',
          comparison: "COMPARISON_GT",
          thresholdValue: options.dailyRequestThreshold,
          duration: "0s",
          aggregations: [
            {
              alignmentPeriod: `${alignmentSeconds}s`,
              perSeriesAligner: "ALIGN_SUM",
              crossSeriesReducer: "REDUCE_SUM",
              groupByFields: ["metric.label.quota_metric"],
            },
          ],
        },
      },
    ],
    notificationChannels: channels,
    alertStrategy: {
      autoClose: "86400s",
    },
  };
}

export function buildGcloudAlertPolicyCommand(
  projectId: string,
  policy: AlertPolicyPayload,
  fileName: string = "gemini-connector-alert-policy.json",
): string {
  const cleanProject = assertValidMonitoringProjectId(projectId);
  const safeFile = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const jsonText = JSON.stringify(policy, null, 2);
  return [
    `cat <<'EOF' > ${safeFile}`,
    jsonText,
    `EOF`,
    `gcloud alpha monitoring policies create \\`,
    `  --project='${cleanProject.replace(/'/g, "'\\''")}' \\`,
    `  --policy-from-file=${safeFile}`,
  ].join("\n");
}
