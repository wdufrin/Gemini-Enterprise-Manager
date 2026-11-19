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

import { LogEntry } from '../../types';
import { gapiRequest, GapiError } from './core';

export const AUDIT_GOVERNANCE_SERVICES = [
  'discoveryengine.googleapis.com',
  'modelarmor.googleapis.com',
  'agentregistry.googleapis.com',
  'aiplatform.googleapis.com',
] as const;

export type AuditGovernanceService = (typeof AUDIT_GOVERNANCE_SERVICES)[number] | 'ALL';
export type AuditTimeWindow = '24h' | '7d' | '30d';

export interface AuditLogQueryOptions {
  projectId: string;
  timeWindow?: AuditTimeWindow;
  serviceFilter?: AuditGovernanceService | string;
  principalEmail?: string;
  methodName?: string;
  searchQuery?: string;
  pageSize?: number;
  pageToken?: string;
  nowMs?: number;
}

export interface ParsedAuditLogEntry {
  id: string;
  timestamp: string;
  severity: string;
  logType: 'ADMIN_ACTIVITY' | 'POLICY' | 'OTHER';
  serviceName: string;
  methodName: string;
  resourceName: string;
  principalEmail: string;
  callerIp: string;
  statusCode?: number;
  statusMessage?: string;
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  serviceData?: Record<string, unknown>;
  policyDelta?: Record<string, unknown>;
  protoPayload: Record<string, unknown>;
  rawEntry: LogEntry;
}

export interface FetchAdminAuditLogsResult {
  entries: ParsedAuditLogEntry[];
  nextPageToken?: string;
  executedFilter: string;
}

const VALID_PROJECT_IDENTIFIER = /^(?:[a-z][a-z0-9-]{4,29}|\d+|[a-z0-9][a-z0-9._:-]*)$/i;

/**
 * Escapes user-provided strings before embedding inside double-quoted Cloud Logging
 * filter expressions (`field="value"` or `field:"value"`).
 *
 * Neutralizes `\`, `"`, and control characters so an input such as
 * `alice" OR logName:"` cannot break out of the quoted literal or alter filter logic.
 */
export function escapeLoggingFilterValue(value: string): string {
  return String(value ?? '')
    .replace(/[\r\n\0]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .trim();
}

function resolveTimeWindowMs(window: AuditTimeWindow = '7d'): number {
  switch (window) {
    case '24h':
      return 24 * 60 * 60 * 1000;
    case '30d':
      return 30 * 24 * 60 * 60 * 1000;
    case '7d':
    default:
      return 7 * 24 * 60 * 60 * 1000;
  }
}

/**
 * Builds the Cloud Audit Logs filter targeting Admin Activity (`cloudaudit.googleapis.com%2Factivity`)
 * and Policy (`cloudaudit.googleapis.com%2Fpolicy`) streams across Gemini Enterprise services.
 */
export function buildAdminAuditLogFilter(options: AuditLogQueryOptions): string {
  const now = typeof options.nowMs === 'number' ? options.nowMs : Date.now();
  const cutoffIso = new Date(now - resolveTimeWindowMs(options.timeWindow || '7d')).toISOString();

  const clauses: string[] = [
    'logName:("logs/cloudaudit.googleapis.com%2Factivity" OR "logs/cloudaudit.googleapis.com%2Fpolicy")',
  ];

  const requestedService = (options.serviceFilter || 'ALL').trim();
  if (!requestedService || requestedService === 'ALL') {
    const svcList = AUDIT_GOVERNANCE_SERVICES.map((s) => `"${s}"`).join(' OR ');
    clauses.push(`protoPayload.serviceName:(${svcList})`);
  } else {
    clauses.push(`protoPayload.serviceName="${escapeLoggingFilterValue(requestedService)}"`);
  }

  clauses.push(`timestamp>="${cutoffIso}"`);

  if (options.principalEmail && options.principalEmail.trim()) {
    const escapedPrincipal = escapeLoggingFilterValue(options.principalEmail);
    if (escapedPrincipal) {
      clauses.push(`protoPayload.authenticationInfo.principalEmail:"${escapedPrincipal}"`);
    }
  }

  if (options.methodName && options.methodName.trim()) {
    const escapedMethod = escapeLoggingFilterValue(options.methodName);
    if (escapedMethod) {
      clauses.push(`protoPayload.methodName:"${escapedMethod}"`);
    }
  }

  if (options.searchQuery && options.searchQuery.trim()) {
    const escapedSearch = escapeLoggingFilterValue(options.searchQuery);
    if (escapedSearch) {
      clauses.push(
        `(protoPayload.resourceName:"${escapedSearch}" OR protoPayload.methodName:"${escapedSearch}" OR protoPayload.authenticationInfo.principalEmail:"${escapedSearch}")`
      );
    }
  }

  return clauses.join(' AND ');
}

/**
 * Parses a raw Cloud Logging `LogEntry` carrying an `AuditLog` `protoPayload`
 * into a strongly-typed admin governance record.
 */
export function parseAuditLogEntry(entry: LogEntry, index: number = 0): ParsedAuditLogEntry {
  const proto = (entry.protoPayload || {}) as Record<string, unknown>;
  const authInfo = (proto.authenticationInfo || {}) as Record<string, unknown>;
  const reqMeta = (proto.requestMetadata || {}) as Record<string, unknown>;
  const statusObj = (proto.status || {}) as Record<string, unknown>;
  const serviceData =
    proto.serviceData && typeof proto.serviceData === 'object'
      ? (proto.serviceData as Record<string, unknown>)
      : undefined;
  const metadata =
    proto.metadata && typeof proto.metadata === 'object'
      ? (proto.metadata as Record<string, unknown>)
      : undefined;

  const policyDelta =
    (serviceData?.policyDelta as Record<string, unknown> | undefined) ||
    (metadata?.policyDelta as Record<string, unknown> | undefined) ||
    ((proto.response as Record<string, unknown> | undefined)?.bindings
      ? { bindings: (proto.response as Record<string, unknown>).bindings }
      : undefined);

  const logName = String(entry.logName || '');
  let logType: 'ADMIN_ACTIVITY' | 'POLICY' | 'OTHER' = 'OTHER';
  if (logName.includes('cloudaudit.googleapis.com%2Factivity') || logName.endsWith('/activity')) {
    logType = 'ADMIN_ACTIVITY';
  } else if (
    logName.includes('cloudaudit.googleapis.com%2Fpolicy') ||
    logName.endsWith('/policy')
  ) {
    logType = 'POLICY';
  }

  const rawInsertId = (entry as Record<string, unknown>).insertId;
  const id =
    typeof rawInsertId === 'string' && rawInsertId
      ? rawInsertId
      : `${entry.timestamp || 'ts'}-${String(proto.methodName || 'op')}-${index}`;

  return {
    id,
    timestamp: entry.timestamp || entry.receiveTimestamp || '',
    severity: entry.severity || 'NOTICE',
    logType,
    serviceName: String(proto.serviceName || entry.resource?.type || 'unknown'),
    methodName: String(proto.methodName || 'unknown'),
    resourceName: String(proto.resourceName || ''),
    principalEmail: String(
      authInfo.principalEmail || authInfo.principalSubject || 'system-or-redacted'
    ),
    callerIp: String(reqMeta.callerIp || ''),
    statusCode: typeof statusObj.code === 'number' ? statusObj.code : undefined,
    statusMessage: typeof statusObj.message === 'string' ? statusObj.message : undefined,
    request:
      proto.request && typeof proto.request === 'object'
        ? (proto.request as Record<string, unknown>)
        : undefined,
    response:
      proto.response && typeof proto.response === 'object'
        ? (proto.response as Record<string, unknown>)
        : undefined,
    metadata,
    serviceData,
    policyDelta,
    protoPayload: proto,
    rawEntry: entry,
  };
}

/**
 * Queries real Cloud Audit Logs via `POST https://logging.googleapis.com/v2/entries:list`.
 * Never swallows API or 403 IAM errors.
 */
export async function fetchAdminAuditLogs(
  options: AuditLogQueryOptions
): Promise<FetchAdminAuditLogsResult> {
  const cleanProject = String(options.projectId ?? '').trim();
  if (!cleanProject || !VALID_PROJECT_IDENTIFIER.test(cleanProject)) {
    throw new Error(
      `Invalid GCP project identifier "${options.projectId}". Specify a valid Project ID or Project Number.`
    );
  }

  const pageSize = Math.min(Math.max(Number(options.pageSize) || 100, 1), 500);
  const filter = buildAdminAuditLogFilter(options);

  const requestBody: Record<string, unknown> = {
    resourceNames: [`projects/${cleanProject}`],
    filter,
    orderBy: 'timestamp desc',
    pageSize,
  };
  if (options.pageToken) {
    requestBody.pageToken = options.pageToken;
  }

  const response = await gapiRequest<{ entries?: LogEntry[]; nextPageToken?: string }>(
    'https://logging.googleapis.com/v2/entries:list',
    'POST',
    cleanProject,
    undefined,
    requestBody
  );

  const rawEntries = Array.isArray(response?.entries) ? response.entries : [];
  const entries = rawEntries.map((entry, idx) => parseAuditLogEntry(entry, idx));

  return {
    entries,
    nextPageToken: response?.nextPageToken,
    executedFilter: filter,
  };
}

/**
 * Detects whether an error thrown by `fetchAdminAuditLogs` is an IAM permission error (`403` / `PERMISSION_DENIED`).
 */
export function isAuditLogPermissionError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof GapiError && err.status === 403) return true;
  const obj = err as { status?: number; code?: string | number; message?: string };
  if (obj.status === 403 || obj.code === 403 || obj.code === 'PERMISSION_DENIED') {
    return true;
  }
  const msg = String(obj.message || err);
  return /\b403\b|PERMISSION_DENIED|logging\.logEntries\.list|permission denied|caller does not have permission/i.test(
    msg
  );
}

function escapeCsvCell(raw: unknown): string {
  let str = raw === null || raw === undefined ? '' : String(raw);
  // Neutralize spreadsheet formula injection (`=`, `+`, `-`, `@`, leading tab/CR)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Serializes parsed Cloud Audit Log records to RFC-4180 CSV with formula-injection protection.
 */
export function exportAuditLogsToCsv(entries: ParsedAuditLogEntry[]): string {
  const headers = [
    'Timestamp',
    'Log Type',
    'Severity',
    'Service',
    'Method',
    'Principal Email',
    'Resource Name',
    'Caller IP',
    'Status Code',
    'Status Message',
  ];

  const rows = entries.map((e) =>
    [
      e.timestamp,
      e.logType,
      e.severity,
      e.serviceName,
      e.methodName,
      e.principalEmail,
      e.resourceName,
      e.callerIp,
      e.statusCode !== undefined ? String(e.statusCode) : '0',
      e.statusMessage || '',
    ]
      .map(escapeCsvCell)
      .join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}
