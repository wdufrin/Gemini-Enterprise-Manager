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

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gapiRequest, GapiError } from './core';
import {
  listSecrets,
  accessSecretVersion,
  decodeBase64Utf8,
} from './secretManager';
import { runBigQueryQuery, dryRunBigQueryQuery } from './bigquery';
import CostsUI, {
  getPacificMidnightStartIso,
  validateBillingExportTable,
  buildFinOpsBillingExportQuery,
  FINOPS_MAX_BYTES_BILLED,
} from '../../components/dashboard/CostsUI';
import {
  OPERATIONAL_VIEWS,
  buildMainTableSubqueryForView,
} from '../../components/dashboard/operational/analyticsData';
import AuthForm from '../../components/authorizations/AuthForm';
import AuthorizationsPage from '../../pages/AuthorizationsPage';
import * as apiService from '../apiService';

vi.mock('./core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./core')>();
  return {
    ...actual,
    gapiRequest: vi.fn(),
  };
});

const mockedGapi = vi.mocked(gapiRequest);

describe('secretManager API & OAuth Integration (Item #8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists project secrets via Secret Manager v1 and decodes UTF-8 base64 secret versions in memory', async () => {
    mockedGapi.mockResolvedValueOnce({
      secrets: [
        { name: 'projects/ent-prod/secrets/jira-oauth-client-secret' },
        { name: 'projects/ent-prod/secrets/servicenow-secret' },
      ],
    });

    const secrets = await listSecrets('ent-prod');
    expect(secrets).toHaveLength(2);
    expect(mockedGapi).toHaveBeenCalledWith(
      'https://secretmanager.googleapis.com/v1/projects/ent-prod/secrets?pageSize=100',
      'GET',
      'ent-prod',
    );

    const rawSecret = 'GOCSPX-9988_utf8_sécret!';
    const b64 = Buffer.from(rawSecret, 'utf-8').toString('base64');
    mockedGapi.mockResolvedValueOnce({
      name: 'projects/ent-prod/secrets/jira-oauth-client-secret/versions/3',
      payload: { data: b64 },
    });

    const decoded = await accessSecretVersion(
      'projects/ent-prod/secrets/jira-oauth-client-secret/versions/latest',
      'ent-prod',
    );
    expect(decoded).toBe(rawSecret);
    expect(mockedGapi).toHaveBeenLastCalledWith(
      'https://secretmanager.googleapis.com/v1/projects/ent-prod/secrets/jira-oauth-client-secret/versions/latest:access',
      'GET',
      'ent-prod',
    );
  });

  it('propagates 403 PERMISSION_DENIED errors from Secret Manager without swallowing and rejects hostile/malformed inputs', async () => {
    mockedGapi.mockRejectedValueOnce(
      new GapiError(
        'Permission secretmanager.versions.access denied for resource',
        403,
        'PERMISSION_DENIED',
      ),
    );

    await expect(
      accessSecretVersion('projects/ent-prod/secrets/locked-secret/versions/latest', 'ent-prod'),
    ).rejects.toThrow(/secretmanager\.versions\.access denied/i);

    // Negative checks: empty projectId, path traversal / malformed version resource name, corrupted base64
    await expect(listSecrets('   ')).rejects.toThrow(/Project ID is required/i);
    await expect(
      accessSecretVersion('projects/ent-prod/secrets/../../etc/passwd', 'ent-prod'),
    ).rejects.toThrow(/Invalid Secret Manager version resource name/i);
    expect(() => decodeBase64Utf8('%%%NOT_VALID_BASE64%%%')).toThrow(/Malformed base64/i);
  });

  it('loads secret into AuthForm via Secret Manager picker without exposing plaintext in DOM or cURL preview', async () => {
    const secretPlaintext = 'SUPER_CONFIDENTIAL_OAUTH_SECRET_VALUE_777';
    const encoded = Buffer.from(secretPlaintext, 'utf-8').toString('base64');

    mockedGapi.mockImplementation(async (url: string) => {
      if (url.includes('/secrets?pageSize=100')) {
        return {
          secrets: [{ name: 'projects/ent-prod/secrets/workspace-oauth-secret' }],
        };
      }
      if (url.endsWith('/versions/latest:access')) {
        return { payload: { data: encoded } };
      }
      return {};
    });

    const onSuccess = vi.fn();
    const { container } = render(
      React.createElement(AuthForm, {
        config: {
          projectId: 'ent-prod',
          appLocation: 'global',
          collectionId: 'default_collection',
          appId: '',
          assistantId: 'default_assistant',
        },
        onSuccess,
        onCancel: () => {},
      }),
    );

    fireEvent.change(screen.getByLabelText(/Authorization ID/i), {
      target: { value: 'ws-oauth' },
    });
    fireEvent.change(screen.getByLabelText(/OAuth 2\.0 Client ID/i), {
      target: { value: 'client-123.apps.googleusercontent.com' },
    });

    fireEvent.click(screen.getByTestId('load-from-secret-manager-button'));
    expect(await screen.findByTestId('secret-manager-select')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('apply-secret-version-button'));
    expect(await screen.findByTestId('secret-manager-loaded-badge')).toHaveTextContent(
      'workspace-oauth-secret/versions/latest (masked in memory)',
    );

    const secretInput = screen.getByLabelText(/OAuth 2\.0 Client Secret/i) as HTMLInputElement;
    expect(secretInput.type).toBe('password');
    expect(secretInput.value).toBe(secretPlaintext);

    // Visible text / cURL preview must redact secret and never render plaintext
    expect(container.textContent).not.toContain(secretPlaintext);
    expect(container.textContent).toContain('[YOUR_CLIENT_SECRET]');
  });

  it('displays red Active Agent Dependency Warning listing bound agents when deleting an in-use authorization', async () => {
    const activeAuth = {
      name: 'projects/12345/locations/global/authorizations/jira-prod-oauth',
      displayName: 'Jira Prod OAuth',
      serverSideOauth2: {
        clientId: 'jira-cid',
        authorizationUri: 'https://auth.atlassian.com/authorize',
        tokenUri: 'https://auth.atlassian.com/oauth/token',
      },
    };

    render(
      React.createElement(AuthorizationsPage, {
        projectNumber: '12345',
        projectId: 'ent-prod',
        hasLoaded: true,
        authorizations: [activeAuth],
        authUsage: {
          [activeAuth.name]: [
            {
              name: 'projects/12345/locations/global/collections/default_collection/engines/e1/assistants/default_assistant/agents/jira-triage-bot',
              displayName: 'Jira Incident Triage Bot',
            } as never,
          ],
        },
      }),
    );

    const deleteButtons = await screen.findAllByRole('button', { name: /Delete/i });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);

    const dependencyBanner = await screen.findByTestId('active-agent-dependency-warning');
    expect(dependencyBanner).toHaveTextContent(/Active Agent Dependency Warning/i);
    expect(dependencyBanner).toHaveTextContent('Jira Incident Triage Bot');
  });
});

describe('FinOps Cloud Billing Export & Query Guardrails (Item #3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes maximumBytesBilled to BigQuery jobs.query when provided and omits it when absent', async () => {
    mockedGapi.mockResolvedValueOnce({ jobComplete: true, rows: [] });
    await runBigQueryQuery('finops-proj', 'SELECT 1', { maximumBytesBilled: FINOPS_MAX_BYTES_BILLED });

    expect(mockedGapi.mock.calls[0][4]).toEqual({
      query: 'SELECT 1',
      useLegacySql: false,
      timeoutMs: 30000,
      maximumBytesBilled: '5368709120',
    });

    mockedGapi.mockResolvedValueOnce({ jobComplete: true, rows: [] });
    await runBigQueryQuery('finops-proj', 'SELECT 2');
    expect(mockedGapi.mock.calls[1][4]).toEqual({
      query: 'SELECT 2',
      useLegacySql: false,
      timeoutMs: 30000,
    });
  });

  it('computes Midnight America/Los_Angeles accurately across PDT (UTC-7) and PST (UTC-8) boundaries', () => {
    // Summer PDT (UTC-7): 2026-07-15T18:30:00Z is 11:30 AM PDT -> Midnight PDT is 2026-07-15T07:00:00.000Z
    expect(getPacificMidnightStartIso(new Date('2026-07-15T18:30:00.000Z'))).toBe(
      '2026-07-15T07:00:00.000Z',
    );

    // Winter PST cross-UTC-day boundary (UTC-8): 2026-11-19T05:30:00Z is 9:30 PM PST on Nov 18 -> Midnight PST is 2026-11-18T08:00:00.000Z
    expect(getPacificMidnightStartIso(new Date('2026-11-19T05:30:00.000Z'))).toBe(
      '2026-11-18T08:00:00.000Z',
    );
  });

  it('strictly validates Billing Export table names, rejects SQL injection payloads, runs dry-run first, and enforces 5 GB cap in CostsUI', async () => {
    expect(validateBillingExportTable('my-proj.billing_ds.gcp_billing_export_v1_*').valid).toBe(true);
    expect(validateBillingExportTable('proj; DROP TABLE x; --').valid).toBe(false);
    expect(validateBillingExportTable('proj.ds.table` UNION ALL SELECT * FROM secrets--').valid).toBe(false);
    expect(() => buildFinOpsBillingExportQuery('bad table name!')).toThrow(/Invalid table format/i);

    vi.spyOn(apiService, 'listBillingAccounts').mockResolvedValue({ billingAccounts: [] });
    vi.spyOn(apiService, 'listLicenseConfigsUsageStats').mockResolvedValue({ licenseConfigUsageStats: [] });
    vi.spyOn(apiService, 'getCloudMonitoringMetrics').mockResolvedValue({ timeSeries: [] });

    mockedGapi.mockImplementation(async (url: string, _method?: string, _proj?: string, _params?: unknown, body?: unknown) => {
      const reqBody = body as Record<string, unknown> | undefined;
      if (url.includes('/bigquery/v2/projects/') && reqBody?.dryRun === true) {
        return { totalBytesProcessed: String(42 * 1024 * 1024) }; // 42 MB
      }
      if (url.includes('/bigquery/v2/projects/') && reqBody?.maximumBytesBilled === '5368709120') {
        return {
          jobComplete: true,
          totalBytesProcessed: String(42 * 1024 * 1024),
          rows: [
            {
              f: [
                { v: 'Vertex AI' },
                { v: 'Gemini 2.5 Pro Input Tokens' },
                { v: 'USD' },
                { v: '150.00' },
                { v: '-25.50' },
                { v: '124.50' },
              ],
            },
          ],
        };
      }
      return {};
    });

    render(React.createElement(CostsUI, { projectNumber: 'finops-proj-1' }));

    const tableInput = screen.getByTestId('finops-billing-table-input');
    fireEvent.change(tableInput, { target: { value: 'invalid;DROP' } });
    expect(screen.getByTestId('finops-table-validation-error')).toBeInTheDocument();
    expect(screen.getByTestId('finops-run-query-button')).toBeDisabled();

    fireEvent.change(tableInput, {
      target: { value: 'finops-proj-1.billing_export.gcp_billing_export_v1_*' },
    });
    fireEvent.click(screen.getByTestId('finops-run-query-button'));

    expect(await screen.findByTestId('finops-estimated-scan-mb')).toHaveTextContent('42.00 MB');
    expect(await screen.findByTestId('finops-mtd-net-spend')).toHaveTextContent('USD 124.50');
    expect(screen.getByText('Gemini 2.5 Pro Input Tokens')).toBeInTheDocument();
  });

  it('injects 30-day partition-pruning filters into operational view queries and inline raw sink subqueries', () => {
    for (const [viewId, def] of Object.entries(OPERATIONAL_VIEWS)) {
      const q = def.getQuery('proj-1', 'ds_logs');
      const rq = def.getRowsQuery('proj-1', 'ds_logs');
      expect(q, `${viewId}.getQuery missing 30d pruning`).toContain('TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)');
      expect(rq, `${viewId}.getRowsQuery missing 30d pruning`).toContain('TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)');
    }

    const rawSubquery = buildMainTableSubqueryForView(
      'v_gemini_genai_telemetry',
      'proj-1',
      'ds_logs',
      new Set(['discoveryengine_googleapis_com_gen_ai_client_inference_operation_details']),
    );
    expect(rawSubquery).toContain('WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)');
  });
});
