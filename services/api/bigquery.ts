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

import { gapiRequest } from "./core";

export interface BigQueryDatasetReference {
  datasetId: string;
  projectId: string;
}

export interface BigQueryTableReference {
  tableId: string;
  datasetId: string;
  projectId: string;
}

export interface BigQueryAccessEntry {
  role?: string;
  userByEmail?: string;
  groupByEmail?: string;
  domain?: string;
  specialGroup?: string;
  iamMember?: string;
  [key: string]: unknown;
}

export interface BigQueryDataset {
  id?: string;
  datasetReference: BigQueryDatasetReference;
  location?: string;
  access?: BigQueryAccessEntry[];
  [key: string]: unknown;
}

export interface BigQueryTable {
  id?: string;
  tableReference: BigQueryTableReference;
  schema?: {
    fields?: Array<{
      name: string;
      type: string;
      mode?: string;
      description?: string;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BigQueryErrorProto {
  reason?: string;
  location?: string;
  debugInfo?: string;
  message?: string;
  [key: string]: unknown;
}

export interface BigQueryQueryResponse<T = Record<string, unknown>> {
  kind?: string;
  schema?: {
    fields?: Array<{ name: string; type: string; mode?: string }>;
  };
  jobReference?: {
    projectId: string;
    jobId: string;
    location?: string;
  };
  totalRows?: string;
  pageToken?: string;
  rows?: Array<{ f: Array<{ v: unknown }> }>;
  parsedRows?: T[];
  totalBytesProcessed?: string;
  jobComplete?: boolean;
  error?: BigQueryErrorProto;
  errors?: BigQueryErrorProto[];
  [key: string]: unknown;
}

export const getDataset = async (
  projectId: string,
  datasetId: string,
): Promise<BigQueryDataset> => {
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}`;
  return gapiRequest<BigQueryDataset>(url, "GET", projectId);
};

export const updateDatasetAccess = async (
  projectId: string,
  datasetId: string,
  access: BigQueryAccessEntry[],
): Promise<BigQueryDataset> => {
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}`;
  const body = { access };
  return gapiRequest<BigQueryDataset>(url, "PATCH", projectId, undefined, body);
};

export const listBigQueryDatasets = async (
  projectId: string,
): Promise<{ datasets?: BigQueryDataset[]; nextPageToken?: string }> => {
  const allDatasets: BigQueryDataset[] = [];
  let pageToken: string | undefined;
  do {
    const tokenParam = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : "";
    const res = await gapiRequest<{ datasets?: BigQueryDataset[]; nextPageToken?: string }>(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets${tokenParam}`,
      "GET",
      projectId,
    );
    if (res?.datasets) {
      allDatasets.push(...res.datasets);
    }
    pageToken = res?.nextPageToken;
  } while (pageToken);
  return { datasets: allDatasets };
};

export const createBigQueryDataset = async (
  projectId: string,
  datasetId: string,
  location: string = "US",
): Promise<BigQueryDataset> => {
  const body = {
    datasetReference: { datasetId, projectId },
    location,
  };
  return gapiRequest<BigQueryDataset>(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets`,
    "POST",
    projectId,
    undefined,
    body,
  );
};

export const listBigQueryTables = async (
  projectId: string,
  datasetId: string,
): Promise<{ tables?: BigQueryTable[]; nextPageToken?: string }> => {
  const allTables: BigQueryTable[] = [];
  let pageToken: string | undefined;
  do {
    const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const res = await gapiRequest<{ tables?: BigQueryTable[]; nextPageToken?: string }>(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}/tables?maxResults=1000${tokenParam}`,
      "GET",
      projectId,
    );
    if (res?.tables) {
      allTables.push(...res.tables);
    }
    pageToken = res?.nextPageToken;
  } while (pageToken);
  return { tables: allTables };
};

export const createBigQueryTable = async (
  projectId: string,
  datasetId: string,
  tableId: string,
): Promise<BigQueryTable> => {
  const body = {
    tableReference: { tableId, datasetId, projectId },
  };
  return gapiRequest<BigQueryTable>(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}/tables`,
    "POST",
    projectId,
    undefined,
    body,
  );
};

export const createBigQueryTableWithSchema = async (
  projectId: string,
  datasetId: string,
  tableId: string,
  schema: Record<string, unknown>,
): Promise<BigQueryTable> => {
  const body = {
    tableReference: { tableId, datasetId, projectId },
    schema,
  };
  return gapiRequest<BigQueryTable>(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}/tables`,
    "POST",
    projectId,
    undefined,
    body,
  );
};

export const insertBigQueryRows = async (
  projectId: string,
  datasetId: string,
  tableId: string,
  rows: Record<string, unknown>[],
): Promise<{ insertErrors?: unknown[] }> => {
  const body = {
    kind: "bigquery#tableDataInsertAllRequest",
    rows: rows.map((row) => ({
      json: row,
    })),
  };
  return gapiRequest<{ insertErrors?: unknown[] }>(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}/tables/${tableId}/insertAll`,
    "POST",
    projectId,
    undefined,
    body,
  );
};

/**
 * Server-side wait for jobs.query. BigQuery's default is 10s; slow 30-day scans on large
 * tenants would otherwise return `jobComplete: false` and require extra round-trips.
 * Kept at 30s (not higher) because each in-flight request occupies one of the 6 slots in
 * `globalApiLimiter`.
 */
export const BIGQUERY_QUERY_TIMEOUT_MS = 30000;
/** Long-poll wait for each jobs.getQueryResults call while a job is still running. */
export const BIGQUERY_POLL_TIMEOUT_MS = 10000;
/**
 * Max getQueryResults polls (~10s each) before giving up: 30s + 57 x 10s = 10 minutes.
 * Raised from ~3.5 minutes after an 80k-user benchmark measured 235s for a 30-day raw-log
 * dashboard query and 73s for a 30-day acceleration backfill.
 */
export const BIGQUERY_MAX_POLLS = 57;

const throwIfBigQueryError = (result: BigQueryQueryResponse<unknown> | undefined, fallback: string): void => {
  if (result?.error || (result?.errors && result.errors.length > 0)) {
    throw new Error(result.error?.message || result.errors?.[0]?.message || fallback);
  }
};

export const runBigQueryQuery = async <T = Record<string, unknown>>(
  projectId: string,
  query: string,
  suppressErrorLog: boolean = false,
): Promise<BigQueryQueryResponse<T>> => {
  let result = await gapiRequest<BigQueryQueryResponse<T>>(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`,
    "POST",
    projectId,
    undefined,
    { query, useLegacySql: false, timeoutMs: BIGQUERY_QUERY_TIMEOUT_MS },
    undefined,
    suppressErrorLog,
  );

  // Embedded errors are returned to the caller unchanged (callers already surface them).
  if (result?.error || (result?.errors && result.errors.length > 0)) {
    return result;
  }

  let polls = 0;
  while (result?.jobComplete === false) {
    const jobId = result.jobReference?.jobId;
    if (!jobId) {
      throw new Error("BigQuery reported the query as incomplete but returned no job reference to poll.");
    }
    if (polls >= BIGQUERY_MAX_POLLS) {
      throw new Error(`BigQuery job ${jobId} did not complete after ${polls} polling attempts.`);
    }
    const params = new URLSearchParams({ timeoutMs: String(BIGQUERY_POLL_TIMEOUT_MS) });
    const location = result.jobReference?.location;
    if (location) params.set("location", location);
    result = await gapiRequest<BigQueryQueryResponse<T>>(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries/${encodeURIComponent(jobId)}?${params.toString()}`,
      "GET",
      projectId,
      undefined,
      undefined,
      undefined,
      suppressErrorLog,
    );
    throwIfBigQueryError(result, "BigQuery polling failed");
    polls++;
  }

  return result;
};

/**
 * Validates a query and returns the bytes BigQuery would scan, without running it or
 * incurring query cost (jobs.query with dryRun: true).
 */
export const dryRunBigQueryQuery = async (
  projectId: string,
  query: string,
): Promise<{ totalBytesProcessed: number }> => {
  const result = await gapiRequest<BigQueryQueryResponse>(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`,
    "POST",
    projectId,
    undefined,
    { query, useLegacySql: false, dryRun: true },
    undefined,
    true,
  );
  throwIfBigQueryError(result, "BigQuery dry run failed");
  const bytes = Number(result?.totalBytesProcessed);
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new Error(`BigQuery dry run returned an invalid totalBytesProcessed: ${String(result?.totalBytesProcessed)}`);
  }
  return { totalBytesProcessed: bytes };
};
