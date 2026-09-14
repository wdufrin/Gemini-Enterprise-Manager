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
  return gapiRequest<{ datasets?: BigQueryDataset[]; nextPageToken?: string }>(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets`,
    "GET",
    projectId,
  );
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
  return gapiRequest<{ tables?: BigQueryTable[]; nextPageToken?: string }>(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}/tables?maxResults=1000`,
    "GET",
    projectId,
  );
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

export const runBigQueryQuery = async <T = Record<string, unknown>>(
  projectId: string,
  query: string,
  suppressErrorLog: boolean = false,
): Promise<BigQueryQueryResponse<T>> => {
  return gapiRequest<BigQueryQueryResponse<T>>(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`,
    "POST",
    projectId,
    undefined,
    { query, useLegacySql: false },
    undefined,
    suppressErrorLog,
  );
};
