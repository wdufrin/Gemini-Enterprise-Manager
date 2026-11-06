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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gapiRequest } from './core';
import {
  runBigQueryQuery,
  dryRunBigQueryQuery,
  BIGQUERY_QUERY_TIMEOUT_MS,
  BIGQUERY_POLL_TIMEOUT_MS,
  BIGQUERY_MAX_POLLS,
} from './bigquery';

vi.mock('./core', () => ({
  gapiRequest: vi.fn(),
}));

const mockedGapi = vi.mocked(gapiRequest);

describe('runBigQueryQuery', () => {
  beforeEach(() => {
    mockedGapi.mockReset();
  });

  it('sends timeoutMs with the jobs.query request and returns immediately when the job is complete', async () => {
    mockedGapi.mockResolvedValueOnce({ jobComplete: true, rows: [{ f: [{ v: '1' }] }] });

    const res = await runBigQueryQuery('proj-a', 'SELECT 1');

    expect(res.rows).toEqual([{ f: [{ v: '1' }] }]);
    expect(mockedGapi).toHaveBeenCalledTimes(1);
    const [url, method, project, , body] = mockedGapi.mock.calls[0];
    expect(url).toBe('https://bigquery.googleapis.com/bigquery/v2/projects/proj-a/queries');
    expect(method).toBe('POST');
    expect(project).toBe('proj-a');
    expect(body).toEqual({ query: 'SELECT 1', useLegacySql: false, timeoutMs: BIGQUERY_QUERY_TIMEOUT_MS });
  });

  it('long-polls jobs.getQueryResults with location until jobComplete is true', async () => {
    mockedGapi
      .mockResolvedValueOnce({ jobComplete: false, jobReference: { projectId: 'proj-a', jobId: 'job_1', location: 'US' } })
      .mockResolvedValueOnce({ jobComplete: false, jobReference: { projectId: 'proj-a', jobId: 'job_1', location: 'US' } })
      .mockResolvedValueOnce({ jobComplete: true, rows: [{ f: [{ v: '42' }] }] });

    const res = await runBigQueryQuery('proj-a', 'SELECT 42');

    expect(res.rows).toEqual([{ f: [{ v: '42' }] }]);
    expect(mockedGapi).toHaveBeenCalledTimes(3);
    for (const call of mockedGapi.mock.calls.slice(1)) {
      expect(call[0]).toBe(
        `https://bigquery.googleapis.com/bigquery/v2/projects/proj-a/queries/job_1?timeoutMs=${BIGQUERY_POLL_TIMEOUT_MS}&location=US`
      );
      expect(call[1]).toBe('GET');
    }
  });

  it('throws when an incomplete job has no jobReference to poll', async () => {
    mockedGapi.mockResolvedValueOnce({ jobComplete: false });
    await expect(runBigQueryQuery('proj-a', 'SELECT 1')).rejects.toThrow(/no job reference/i);
  });

  it('throws an explicit error when a polled result contains a BigQuery error', async () => {
    mockedGapi
      .mockResolvedValueOnce({ jobComplete: false, jobReference: { projectId: 'proj-a', jobId: 'job_2' } })
      .mockResolvedValueOnce({ error: { message: 'Resources exceeded during query execution' } });

    await expect(runBigQueryQuery('proj-a', 'SELECT 1')).rejects.toThrow('Resources exceeded during query execution');
  });

  it('stops after BIGQUERY_MAX_POLLS and reports the stuck job instead of looping forever', async () => {
    mockedGapi.mockResolvedValue({ jobComplete: false, jobReference: { projectId: 'proj-a', jobId: 'job_stuck' } });

    await expect(runBigQueryQuery('proj-a', 'SELECT 1')).rejects.toThrow(
      `BigQuery job job_stuck did not complete after ${BIGQUERY_MAX_POLLS} polling attempts.`
    );
    expect(mockedGapi).toHaveBeenCalledTimes(1 + BIGQUERY_MAX_POLLS);
  });

  it('waits at least 10 minutes in total before giving up (30-day raw scans measured 235s at 80k users)', () => {
    expect(BIGQUERY_QUERY_TIMEOUT_MS + BIGQUERY_MAX_POLLS * BIGQUERY_POLL_TIMEOUT_MS).toBeGreaterThanOrEqual(600000);
  });

  it('returns an embedded error from the initial request to the caller without polling', async () => {
    mockedGapi.mockResolvedValueOnce({ error: { message: 'Unrecognized name: foo' } });
    const res = await runBigQueryQuery('proj-a', 'SELECT foo');
    expect(res.error?.message).toBe('Unrecognized name: foo');
    expect(mockedGapi).toHaveBeenCalledTimes(1);
  });
});

describe('dryRunBigQueryQuery', () => {
  beforeEach(() => {
    mockedGapi.mockReset();
  });

  it('sends dryRun: true and parses totalBytesProcessed as a number', async () => {
    mockedGapi.mockResolvedValueOnce({ totalBytesProcessed: '123456789' });
    const res = await dryRunBigQueryQuery('proj-a', 'SELECT 1');
    expect(res.totalBytesProcessed).toBe(123456789);
    expect(mockedGapi.mock.calls[0][4]).toEqual({ query: 'SELECT 1', useLegacySql: false, dryRun: true });
  });

  it('rejects a missing or non-numeric totalBytesProcessed instead of reporting 0 bytes', async () => {
    mockedGapi.mockResolvedValueOnce({});
    await expect(dryRunBigQueryQuery('proj-a', 'SELECT 1')).rejects.toThrow(/invalid totalBytesProcessed/);
    mockedGapi.mockResolvedValueOnce({ totalBytesProcessed: 'NaN_bytes' });
    await expect(dryRunBigQueryQuery('proj-a', 'SELECT 1')).rejects.toThrow(/invalid totalBytesProcessed/);
  });

  it('throws the BigQuery validation error for an invalid query', async () => {
    mockedGapi.mockResolvedValueOnce({ error: { message: 'Syntax error: Unexpected end of script' } });
    await expect(dryRunBigQueryQuery('proj-a', 'SELECT')).rejects.toThrow('Syntax error: Unexpected end of script');
  });
});
