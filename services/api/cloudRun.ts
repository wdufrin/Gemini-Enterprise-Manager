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

import { Config, CloudRunService, IamPolicy, LogEntry } from "../../types";
import {
  GroupLicensingRunReport,
  GroupLicensingRunSummary,
} from "../../components/license/types";
import { gapiRequest, GapiError } from "./core";

export const listCloudRunServices = async (config: Config, region: string): Promise<{ services?: CloudRunService[] }> => {
  const url = `https://${region}-run.googleapis.com/v2/projects/${config.projectId}/locations/${region}/services`;
  return gapiRequest<{ services?: CloudRunService[] }>(url, "GET", config.projectId);
};

export const getCloudRunService = async (name: string, config: Config) => {
  const region = name.split("/")[3];
  const url = `https://${region}-run.googleapis.com/v2/${name}`;
  return gapiRequest<CloudRunService>(url, "GET", config.projectId);
};

export const deleteCloudRunService = async (name: string, config: Config): Promise<Record<string, unknown>> => {
  const region = name.split("/")[3];
  const url = `https://${region}-run.googleapis.com/v2/${name}`;
  return gapiRequest<Record<string, unknown>>(url, "DELETE", config.projectId);
};

export const ensureCloudRunInvokerRole = async (
  serviceName: string,
  serviceAccountEmail: string,
  quotaProjectId: string,
): Promise<void> => {
  const region = serviceName.split("/")[3] || "us-central1";
  const baseUrl = `https://${region}-run.googleapis.com/v2/${serviceName}`;
  const member = `serviceAccount:${serviceAccountEmail}`;
  const role = "roles/run.invoker";

  const policy = await gapiRequest<IamPolicy>(`${baseUrl}:getIamPolicy`, "GET", quotaProjectId);
  const bindings = policy.bindings ? [...policy.bindings] : [];
  const existingBinding = bindings.find((b) => b.role === role);

  if (existingBinding && existingBinding.members?.includes(member)) {
    return;
  }

  const updatedBindings = existingBinding
    ? bindings.map((b) =>
        b.role === role ? { ...b, members: [...(b.members || []), member] } : b,
      )
    : [...bindings, { role, members: [member] }];

  await gapiRequest<IamPolicy>(
    `${baseUrl}:setIamPolicy`,
    "POST",
    quotaProjectId,
    undefined,
    {
      policy: {
        ...policy,
        bindings: updatedBindings,
      },
    },
  );
};

export interface TriggerCloudRunServiceJobParams {
  projectId: string;
  quotaProjectId: string;
  region: string;
  jobId: string;
  serviceUrl?: string;
  serviceAccountEmail?: string;
}

export const triggerCloudRunServiceJob = async ({
  projectId,
  quotaProjectId,
  region,
  jobId,
  serviceUrl,
  serviceAccountEmail,
}: TriggerCloudRunServiceJobParams): Promise<Record<string, unknown>> => {
  const jobName = `projects/${projectId}/locations/${region}/jobs/${jobId}`;
  const runUrl = `https://cloudscheduler.googleapis.com/v1/${jobName}:run`;

  try {
    return await gapiRequest<Record<string, unknown>>(runUrl, "POST", quotaProjectId, undefined, {});
  } catch (err: unknown) {
    const isNotFound = err instanceof GapiError && err.status === 404;
    if (isNotFound && serviceUrl && serviceAccountEmail) {
      const createUrl = `https://cloudscheduler.googleapis.com/v1/projects/${projectId}/locations/${region}/jobs`;
      const schedule = jobId.includes("cleanup") ? "0 */6 * * *" : "0 4 * * *";
      await gapiRequest<Record<string, unknown>>(
        createUrl,
        "POST",
        quotaProjectId,
        undefined,
        {
          name: jobName,
          schedule,
          timeZone: "Etc/UTC",
          // Match deploy.sh: without attemptDeadline Cloud Scheduler applies its 3-minute HTTP default.
          attemptDeadline: "1800s",
          retryConfig: {
            retryCount: 2,
            minBackoffDuration: "600s",
          },
          httpTarget: {
            uri: serviceUrl,
            httpMethod: "POST",
            oidcToken: {
              serviceAccountEmail,
            },
          },
        },
      );
      return await gapiRequest<Record<string, unknown>>(runUrl, "POST", quotaProjectId, undefined, {});
    }
    throw err;
  }
};

export interface CloudSchedulerJobStatus {
  name?: string;
  schedule?: string;
  state?: string;
  lastAttemptTime?: string;
  scheduleTime?: string;
  status?: {
    code?: number;
    message?: string;
  };
}

export const getCloudSchedulerJob = async (
  projectId: string,
  region: string,
  jobId: string,
  quotaProjectId?: string,
): Promise<CloudSchedulerJobStatus> => {
  const jobName = `projects/${projectId}/locations/${region}/jobs/${jobId}`;
  const url = `https://cloudscheduler.googleapis.com/v1/${jobName}`;
  return gapiRequest<CloudSchedulerJobStatus>(url, "GET", quotaProjectId || projectId, undefined, undefined, undefined, true);
};

export const deleteCloudSchedulerJob = async (
  projectId: string,
  region: string,
  jobId: string,
  quotaProjectId?: string,
): Promise<Record<string, unknown>> => {
  const jobName = `projects/${projectId}/locations/${region}/jobs/${jobId}`;
  const url = `https://cloudscheduler.googleapis.com/v1/${jobName}`;
  return gapiRequest<Record<string, unknown>>(url, "DELETE", quotaProjectId || projectId, undefined, undefined, undefined, true);
};

export const fetchGroupLicensingServiceLogs = async (
  projectId: string,
  serviceId: string,
  quotaProjectId?: string,
  sinceTimestamp?: string,
  pageSize: number = 100,
): Promise<{ entries?: LogEntry[] }> => {
  let filter = `resource.type="cloud_run_revision" AND resource.labels.service_name="${serviceId}"`;
  if (sinceTimestamp) {
    filter += ` AND timestamp>="${sinceTimestamp}"`;
  }
  return gapiRequest<{ entries?: LogEntry[] }>(
    "https://logging.googleapis.com/v2/entries:list",
    "POST",
    quotaProjectId || projectId,
    undefined,
    {
      resourceNames: [`projects/${projectId}`],
      filter,
      orderBy: "timestamp desc",
      pageSize,
    },
    undefined,
    true,
  );
};

export interface ParseGroupLicensingLogsMeta {
  serviceId: string;
  serviceName: string;
  defaultJobType?: string;
  defaultLocation?: string;
  defaultTier?: string;
  schedulerStatus?: CloudSchedulerJobStatus;
}

const extractLogLineText = (entry: LogEntry): string => {
  if (typeof entry.textPayload === "string") {
    return entry.textPayload.trim();
  }
  if (entry.jsonPayload && typeof entry.jsonPayload === "object") {
    const msg = (entry.jsonPayload as Record<string, unknown>).message;
    if (typeof msg === "string") {
      return msg.trim();
    }
  }
  return "";
};

const START_OF_RUN_REGEX = /^Running (Joiner|Garbage Collection) workflow(\s*\(DRY RUN\))?/i;
const STRUCTURED_REPORT_PREFIX = "GROUP_LICENSING_REPORT_JSON:";

const GRPC_CODE_LABELS: Record<number, string> = {
  1: "CANCELLED",
  2: "UNKNOWN (Cloud Run returned non-2xx HTTP status)",
  3: "INVALID_ARGUMENT",
  4: "DEADLINE_EXCEEDED (Cloud Run request timed out)",
  5: "NOT_FOUND",
  7: "PERMISSION_DENIED (verify roles/run.invoker on the service account)",
  8: "RESOURCE_EXHAUSTED",
  9: "FAILED_PRECONDITION (safety guard HTTP 412)",
  12: "UNIMPLEMENTED",
  13: "INTERNAL (Cloud Run returned HTTP 500)",
  14: "UNAVAILABLE",
  16: "UNAUTHENTICATED (verify OIDC service account configuration)",
};

/**
 * Parses Cloud Run revision log entries (ordered newest-first from Cloud Logging)
 * into a structured GroupLicensingRunReport.
 *
 * Supports both:
 * 1. Structured JSON reports emitted via `GROUP_LICENSING_REPORT_JSON: {...}`
 * 2. Regex Pattern Matching over stdout lines from older deployed services (note: regex
 *    matching is line-oriented and only extracts single-line stdout messages).
 */
export const parseGroupLicensingRunLogs = (
  entries: LogEntry[],
  meta: ParseGroupLicensingLogsMeta,
): { report: GroupLicensingRunReport | null; isComplete: boolean } => {
  const {
    serviceId,
    serviceName,
    defaultJobType = serviceId.includes("cleanup") ? "cleanup" : "adder",
    defaultLocation,
    defaultTier,
    schedulerStatus,
  } = meta;

  if (!entries || entries.length === 0) {
    const rpcCode = schedulerStatus?.status?.code;
    // In Cloud Scheduler, status.code === -1 means the HTTP attempt is currently in flight / pending.
    if (rpcCode === -1) {
      return {
        isComplete: false,
        report: {
          serviceId,
          serviceName,
          jobType: defaultJobType,
          status: "running",
          timestamp: schedulerStatus?.lastAttemptTime || new Date().toISOString(),
          location: defaultLocation,
          subscriptionTier: defaultTier,
          message: `Job ${defaultJobType} is currently executing (waiting for Cloud Run logs)...`,
          summary: {
            job: defaultJobType,
            warnings: [],
          },
          rawLogs: [],
          source: "scheduler_status",
        },
      };
    }
    if (typeof rpcCode === "number" && rpcCode > 0) {
      const codeLabel = GRPC_CODE_LABELS[rpcCode] || `gRPC code ${rpcCode}`;
      return {
        isComplete: true,
        report: {
          serviceId,
          serviceName,
          jobType: defaultJobType,
          status: rpcCode === 9 ? "aborted" : "error",
          timestamp: schedulerStatus?.lastAttemptTime || new Date().toISOString(),
          location: defaultLocation,
          subscriptionTier: defaultTier,
          message: schedulerStatus?.status?.message
            ? `Cloud Scheduler invocation failed (${codeLabel}): ${schedulerStatus.status.message}`
            : `Cloud Scheduler invocation failed: ${codeLabel}.`,
          summary: {
            job: defaultJobType,
            warnings: [],
          },
          rawLogs: [],
          source: "scheduler_status",
        },
      };
    }
    return { report: null, isComplete: false };
  }

  // Isolate the single most recent execution from newest-first log entries.
  const latestRunEntriesDesc: LogEntry[] = [];
  for (const entry of entries) {
    latestRunEntriesDesc.push(entry);
    const text = extractLogLineText(entry);
    if (START_OF_RUN_REGEX.test(text)) {
      break;
    }
  }

  const chronological = [...latestRunEntriesDesc].reverse();
  const rawLogs: string[] = [];
  let structuredPayload: Record<string, unknown> | null = null;
  let requestStatus: number | undefined;
  let requestLatencySec: number | undefined;
  let latestTimestamp = entries[0]?.timestamp || new Date().toISOString();

  for (const entry of chronological) {
    if (entry.timestamp) {
      latestTimestamp = entry.timestamp;
    }
    if (typeof entry.httpRequest?.status === "number") {
      requestStatus = entry.httpRequest.status;
    }
    if (typeof entry.httpRequest?.latency === "string") {
      const parsedLatency = parseFloat(entry.httpRequest.latency.replace(/s$/i, ""));
      if (!Number.isNaN(parsedLatency)) {
        requestLatencySec = Math.round(parsedLatency * 100) / 100;
      }
    }

    const rawText = extractLogLineText(entry);
    if (!rawText) continue;

    for (const line of rawText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith(STRUCTURED_REPORT_PREFIX)) {
        const jsonPart = trimmed.slice(STRUCTURED_REPORT_PREFIX.length).trim();
        try {
          const parsed = JSON.parse(jsonPart);
          if (parsed && typeof parsed === "object") {
            structuredPayload = parsed as Record<string, unknown>;
          }
        } catch (parseErr) {
          rawLogs.push(`[Malformed report JSON: ${(parseErr as Error).message}]`);
        }
      } else {
        rawLogs.push(trimmed);
      }
    }
  }

  if (structuredPayload) {
    const rawStatus = String(structuredPayload.status || "success");
    const status: GroupLicensingRunReport["status"] =
      rawStatus === "aborted"
        ? "aborted"
        : rawStatus === "error"
          ? "error"
          : "success";
    const summaryObj =
      structuredPayload.summary && typeof structuredPayload.summary === "object"
        ? (structuredPayload.summary as GroupLicensingRunSummary)
        : { job: String(structuredPayload.jobType || defaultJobType), warnings: [] };
    const durationSeconds =
      typeof structuredPayload.durationSeconds === "number"
        ? structuredPayload.durationSeconds
        : typeof summaryObj.durationSeconds === "number"
          ? summaryObj.durationSeconds
          : requestLatencySec;

    return {
      isComplete: true,
      report: {
        serviceId,
        serviceName,
        jobType: String(structuredPayload.jobType || summaryObj.job || defaultJobType),
        status,
        httpStatus:
          typeof structuredPayload.httpStatus === "number"
            ? structuredPayload.httpStatus
            : requestStatus,
        timestamp: latestTimestamp,
        durationSeconds,
        location: String(structuredPayload.location || defaultLocation || ""),
        subscriptionTier: String(structuredPayload.subscriptionTier || defaultTier || ""),
        message: String(structuredPayload.message || `Job ${defaultJobType} completed.`),
        summary: summaryObj,
        rawLogs,
        source: "structured_json",
      },
    };
  }

  // Fallback: Regex Pattern Matching over stdout lines from legacy or in-progress runs.
  let jobType = defaultJobType;
  let dryRun = false;
  let currentGroup: string | null = null;
  const groupMemberCounts: Record<string, number> = {};
  let alreadyCorrect: number | undefined;
  let skippedUnmanaged: number | undefined;
  let plannedAssignments: number | undefined;
  let plannedRevocations: number | undefined;
  const revokedUsersSample: string[] = [];
  const warnings: string[] = [];
  let writeSummary: GroupLicensingRunSummary["write"] | undefined;
  let status: GroupLicensingRunReport["status"] = "running";
  let message = `Job ${jobType} is running...`;
  let sawTerminalLine = false;

  for (const line of rawLogs) {
    const startMatch = line.match(START_OF_RUN_REGEX);
    if (startMatch) {
      jobType = startMatch[1].toLowerCase() === "joiner" ? "adder" : "cleanup";
      dryRun = Boolean(startMatch[2]);
      continue;
    }

    const groupMatch = line.match(/^(?:Listing members|Resolving entitled members) for group:\s*(.+)$/i);
    if (groupMatch) {
      currentGroup = groupMatch[1].trim().toLowerCase();
      if (!(currentGroup in groupMemberCounts)) {
        groupMemberCounts[currentGroup] = 0;
      }
      continue;
    }

    const resolvedMatch = line.match(/^Resolved (\d+) user members(?: for ([^\s(]+))?/i);
    if (resolvedMatch) {
      const targetGroup = resolvedMatch[2]
        ? resolvedMatch[2].trim().toLowerCase()
        : currentGroup;
      if (targetGroup) {
        currentGroup = targetGroup;
        groupMemberCounts[targetGroup] = Number(resolvedMatch[1]);
      }
      continue;
    }

    const skippedMatch = line.match(/^Leaving (\d+) user\(s\) on licenses from tiers/i);
    if (skippedMatch) {
      skippedUnmanaged = Number(skippedMatch[1]);
      continue;
    }

    const assignMatch = line.match(/^Applying (\d+) license assignments(?: \((\d+) already up to date\))?/i);
    if (assignMatch) {
      plannedAssignments = Number(assignMatch[1]);
      if (assignMatch[2] !== undefined) {
        alreadyCorrect = Number(assignMatch[2]);
      }
      status = "success";
      message = `Applied ${plannedAssignments} license assignment(s).`;
      sawTerminalLine = true;
      continue;
    }

    if (/^No assignments to make\./i.test(line)) {
      plannedAssignments = plannedAssignments ?? 0;
      status = "success";
      message = "No new license assignments were needed.";
      sawTerminalLine = true;
      continue;
    }

    const revokeUserMatch = line.match(/^User (\S+) is no longer entitled\. Revoking license\./i);
    if (revokeUserMatch) {
      if (revokedUsersSample.length < 50) {
        revokedUsersSample.push(revokeUserMatch[1]);
      }
      continue;
    }

    const revokeBatchMatch = line.match(/^Applying (\d+) license revocations/i);
    if (revokeBatchMatch) {
      plannedRevocations = Number(revokeBatchMatch[1]);
      status = "success";
      message = `Applied ${plannedRevocations} license revocation(s).`;
      sawTerminalLine = true;
      continue;
    }

    if (/^No revocations to make\./i.test(line)) {
      plannedRevocations = plannedRevocations ?? 0;
      status = "success";
      message = "No license revocations were needed.";
      sawTerminalLine = true;
      continue;
    }

    const writesMatch = line.match(
      /^License writes:\s*(\d+) submitted in (\d+) chunk\(s\);\s*(\d+) confirmed,\s*(\d+) failed,\s*(\d+) chunk\(s\) left/i,
    );
    if (writesMatch) {
      writeSummary = {
        submitted: Number(writesMatch[1]),
        chunks: Number(writesMatch[2]),
        succeeded: Number(writesMatch[3]),
        failed: Number(writesMatch[4]),
        unverifiedChunks: Number(writesMatch[5]),
      };
      sawTerminalLine = true;
      continue;
    }

    const safetyMatch = line.match(/^SAFETY GUARD - no changes were made:\s*(.+)$/i);
    if (safetyMatch) {
      status = "aborted";
      message = safetyMatch[1];
      sawTerminalLine = true;
      continue;
    }

    const syncErrMatch = line.match(/^LICENSE SYNC INCOMPLETE:\s*(.+)$/i);
    if (syncErrMatch) {
      status = "error";
      message = syncErrMatch[1];
      sawTerminalLine = true;
      continue;
    }

    const fatalMatch = line.match(/^FATAL ERROR:\s*(.+)$/i);
    if (fatalMatch) {
      status = "error";
      message = fatalMatch[1];
      sawTerminalLine = true;
      continue;
    }

    const warnMatch = line.match(/^Warning:\s*(.+)$/i);
    if (warnMatch) {
      const warnText = warnMatch[1].trim();
      // Ignore benign server-side filter fallback notices when client-side ASSIGNED filtering handles it
      if (!/^userLicenses filter was rejected/i.test(warnText)) {
        warnings.push(warnText);
      }
    }
  }

  const sawRequestCompletion = typeof requestStatus === "number";
  if (typeof requestStatus === "number") {
    if (requestStatus === 412) {
      status = "aborted";
    } else if (requestStatus >= 400) {
      status = "error";
      if (message.endsWith("is running...")) {
        message = `Job ${jobType} failed with HTTP ${requestStatus}.`;
      }
    } else if (status === "running") {
      status = "success";
      message = `Job ${jobType} completed.`;
    }
  }

  const groupKeys = Object.keys(groupMemberCounts);
  const totalGroupMembers = groupKeys.reduce((acc, g) => acc + groupMemberCounts[g], 0);

  const summary: GroupLicensingRunSummary = {
    job: jobType,
    dryRun,
    groups: groupKeys.length > 0 ? groupKeys.length : undefined,
    groupMemberCounts: groupKeys.length > 0 ? groupMemberCounts : undefined,
    entitledUsers: groupKeys.length > 0 ? totalGroupMembers : undefined,
    alreadyCorrect,
    skippedUnmanaged,
    plannedAssignments,
    plannedRevocations:
      plannedRevocations !== undefined
        ? plannedRevocations
        : revokedUsersSample.length > 0
          ? revokedUsersSample.length
          : undefined,
    revokedUsersSample: revokedUsersSample.length > 0 ? revokedUsersSample : undefined,
    write: writeSummary,
    warnings,
    durationSeconds: requestLatencySec,
  };

  return {
    isComplete: sawTerminalLine || sawRequestCompletion,
    report: {
      serviceId,
      serviceName,
      jobType,
      status,
      httpStatus: requestStatus,
      timestamp: latestTimestamp,
      durationSeconds: requestLatencySec,
      location: defaultLocation,
      subscriptionTier: defaultTier,
      message,
      summary,
      rawLogs,
      source: "parsed_stdout",
    },
  };
};

export interface FetchGroupLicensingRunReportParams {
  projectId: string;
  quotaProjectId?: string;
  region: string;
  serviceId: string;
  serviceName: string;
  jobId?: string;
  sinceTimestamp?: string;
  defaultJobType?: string;
  defaultLocation?: string;
  defaultTier?: string;
  waitForCompletion?: boolean;
  maxAttempts?: number;
  pollIntervalMs?: number;
  onProgress?: (partialReport: GroupLicensingRunReport) => void;
}

const DEFAULT_REPORT_POLL_INTERVAL_MS =
  typeof process !== "undefined" && process.env?. VITEST ? 0 : 2000;

export const fetchGroupLicensingRunReport = async ({
  projectId,
  quotaProjectId,
  region,
  serviceId,
  serviceName,
  jobId,
  sinceTimestamp,
  defaultJobType,
  defaultLocation,
  defaultTier,
  waitForCompletion = false,
  maxAttempts = 15,
  pollIntervalMs = DEFAULT_REPORT_POLL_INTERVAL_MS,
  onProgress,
}: FetchGroupLicensingRunReportParams): Promise<GroupLicensingRunReport | null> => {
  const attempts = waitForCompletion ? Math.max(1, maxAttempts) : 1;
  let lastPartialReport: GroupLicensingRunReport | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const isFinalAttempt = attempt === attempts;
    const logRes = await fetchGroupLicensingServiceLogs(
      projectId,
      serviceId,
      quotaProjectId || projectId,
      sinceTimestamp,
      100,
    );
    let entries = logRes?.entries || [];

    // On the final attempt, if sinceTimestamp returned 0 entries (e.g. due to browser/server clock drift),
    // widen the window to 2 minutes before sinceTimestamp so fresh Cloud Run logs are not missed.
    if (entries.length === 0 && isFinalAttempt && sinceTimestamp) {
      const parsedSince = Date.parse(sinceTimestamp);
      if (!Number.isNaN(parsedSince)) {
        const widerSince = new Date(parsedSince - 120_000).toISOString();
        const fallbackLogRes = await fetchGroupLicensingServiceLogs(
          projectId,
          serviceId,
          quotaProjectId || projectId,
          widerSince,
          100,
        );
        entries = fallbackLogRes?.entries || [];
      }
    }

    let schedulerStatus: CloudSchedulerJobStatus | undefined;
    // Only fall back to Cloud Scheduler job status when not waiting for completion or on the final poll attempt,
    // so an in-flight or prior scheduler status never short-circuits Cloud Run log polling on attempt 1.
    if (entries.length === 0 && jobId && (!waitForCompletion || isFinalAttempt)) {
      try {
        schedulerStatus = await getCloudSchedulerJob(
          projectId,
          region,
          jobId,
          quotaProjectId || projectId,
        );
      } catch (schedErr) {
        // Cloud Scheduler job lookup is optional enrichment when Cloud Run logs are empty
        console.debug("Could not read Cloud Scheduler job status during report poll:", schedErr);
      }
    }

    const { report, isComplete } = parseGroupLicensingRunLogs(entries, {
      serviceId,
      serviceName,
      defaultJobType,
      defaultLocation,
      defaultTier,
      schedulerStatus,
    });

    if (report) {
      lastPartialReport = report;
      onProgress?.(report);
    }
    if (isComplete || !waitForCompletion) {
      return report;
    }

    if (attempt < attempts && pollIntervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  return lastPartialReport;
};



