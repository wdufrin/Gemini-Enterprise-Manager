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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runConnectorDiagnostics,
  deriveConnectorRemediation,
} from './connectorDiagnostics';
import { extractConnectorCollectionId, fetchConnectorLogs } from '../../services/api/monitoring';
import { checkServiceAccountPermissions } from '../../services/api/iam';
import * as api from '../../services/apiService';
import * as core from '../../services/api/core';
import { Collection, Config, DataConnector, Operation } from '../../types';

vi.mock('../../services/apiService', () => ({
  getDataConnector: vi.fn(),
  listResources: vi.fn(),
  listOperations: vi.fn(),
  listMcpTools: vi.fn(),
  fetchConnectorLogs: vi.fn(),
}));

vi.mock('../../services/api/core', async () => {
  const actual = await vi.importActual<typeof import('../../services/api/core')>(
    '../../services/api/core'
  );
  return {
    ...actual,
    gapiRequest: vi.fn(),
  };
});

describe('Connector Diagnostics & Cloud Logging Filter Verification', () => {
  const baseConfig: Config = {
    projectId: '123456789',
    appLocation: 'global',
    collectionId: 'default_collection',
    appId: 'engine-1',
    assistantId: 'default_assistant',
  };

  const healthyCollection: Collection = {
    name: 'projects/123456789/locations/global/collections/sharepoint_prod',
    displayName: 'SharePoint Production',
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('extracts collectionId instead of literal "dataConnector" from DataConnector resource names', () => {
    expect(
      extractConnectorCollectionId(
        'projects/123456789/locations/global/collections/servicenow_prod_1/dataConnector'
      )
    ).toBe('servicenow_prod_1');

    expect(
      extractConnectorCollectionId(
        'projects/my-proj/locations/us/collections/jira_cloud_col'
      )
    ).toBe('jira_cloud_col');

    expect(extractConnectorCollectionId('', 'fallback_col')).toBe('fallback_col');
  });

  it('constructs Cloud Logging filter with actual collectionId and status>=500 for Cloud Run MCP', async () => {
    vi.mocked(core.gapiRequest).mockResolvedValueOnce({ entries: [] });

    await fetchConnectorLogs(
      baseConfig,
      'projects/123456789/locations/global/collections/mcp_col_42/dataConnector',
      2,
      'https://my-mcp-srv-uc.a.run.app/sse'
    );

    expect(core.gapiRequest).toHaveBeenCalledTimes(1);
    const [, , , , payload] = vi.mocked(core.gapiRequest).mock.calls[0];
    const filter = (payload as { filter: string }).filter;

    expect(filter).toContain('resource.labels.connector_id="mcp_col_42"');
    expect(filter).not.toContain('resource.labels.connector_id="dataConnector"');
    expect(filter).toContain('severity>=ERROR OR httpRequest.status>=500');
    expect(filter).not.toContain('httpRequest.status>=400');
  });

  it('does NOT falsely fail a healthy connector when another collection in the project has a failed operation', async () => {
    const activeConnector: DataConnector = {
      name: 'projects/123456789/locations/global/collections/sharepoint_prod/dataConnector',
      state: 'ACTIVE',
      dataSource: 'ms-sharepoint',
    };

    const unrelatedFailedOp: Operation = {
      name: 'projects/123456789/locations/global/collections/broken_jira_col/operations/sync-999',
      done: true,
      error: { code: 13, message: 'Unrelated collection sync failure' },
      metadata: {
        createTime: new Date(Date.now() - 60000).toISOString(),
      },
    };

    vi.mocked(api.getDataConnector).mockResolvedValueOnce(activeConnector);
    vi.mocked(api.listOperations).mockResolvedValueOnce({
      operations: [unrelatedFailedOp],
    });
    vi.mocked(api.fetchConnectorLogs).mockResolvedValueOnce({ entries: [] });

    const result = await runConnectorDiagnostics(
      healthyCollection,
      baseConfig,
      2
    );

    expect(result.status).toBe('success');
    expect(result.message).toBe('Connector Active');
  });

  it('does NOT falsely fail when an operation omits timestamps in metadata (no Date.now() fallback)', async () => {
    const activeConnector: DataConnector = {
      name: 'projects/123456789/locations/global/collections/sharepoint_prod/dataConnector',
      state: 'ACTIVE',
      dataSource: 'ms-sharepoint',
    };

    const timelessFailedOp: Operation = {
      name: 'projects/123456789/locations/global/collections/sharepoint_prod/operations/ancient-op',
      done: true,
      error: { code: 3, message: 'Historical error without metadata timestamps' },
      metadata: {},
    };

    vi.mocked(api.getDataConnector).mockResolvedValueOnce(activeConnector);
    vi.mocked(api.listOperations).mockResolvedValueOnce({
      operations: [timelessFailedOp],
    });
    vi.mocked(api.fetchConnectorLogs).mockResolvedValueOnce({ entries: [] });

    const result = await runConnectorDiagnostics(
      healthyCollection,
      baseConfig,
      2
    );

    expect(result.status).toBe('success');
    expect(result.message).toBe('Connector Active');
  });

  it('keeps status="success" with a warning when an ACTIVE connector recovered after an earlier error', async () => {
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const sixtyMinsAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const recoveredConnector: DataConnector = {
      name: 'projects/123456789/locations/global/collections/sharepoint_prod/dataConnector',
      state: 'ACTIVE',
      dataSource: 'ms-sharepoint',
      latestRun: {
        state: 'SUCCEEDED',
        endTime: tenMinsAgo,
      },
    };

    const earlierFailedOp: Operation = {
      name: 'projects/123456789/locations/global/collections/sharepoint_prod/operations/op-old',
      done: true,
      error: { code: 7, message: 'Transient OAuth error before credential update' },
      metadata: {
        updateTime: sixtyMinsAgo,
      },
    };

    vi.mocked(api.getDataConnector).mockResolvedValueOnce(recoveredConnector);
    vi.mocked(api.listOperations).mockResolvedValueOnce({
      operations: [earlierFailedOp],
    });
    vi.mocked(api.fetchConnectorLogs).mockResolvedValueOnce({
      entries: [
        {
          timestamp: sixtyMinsAgo,
          severity: 'ERROR',
          textPayload: 'Earlier auth failure',
        },
      ],
    });

    const result = await runConnectorDiagnostics(
      healthyCollection,
      baseConfig,
      2
    );

    expect(result.status).toBe('success');
    const details = result.details as { diagnostics: { warnings: string[]; errors: string[] } };
    expect(details.diagnostics.errors).toHaveLength(0);
    expect(details.diagnostics.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('accurately reports status="error" when the target collection has an unresolved recent operation failure', async () => {
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const connector: DataConnector = {
      name: 'projects/123456789/locations/global/collections/sharepoint_prod/dataConnector',
      state: 'ACTIVE',
      dataSource: 'ms-sharepoint',
    };

    const recentTargetFailure: Operation = {
      name: 'projects/123456789/locations/global/collections/sharepoint_prod/operations/op-fail',
      done: true,
      error: { code: 7, message: 'AADSTS7000215: Invalid client secret provided.' },
      metadata: {
        updateTime: fiveMinsAgo,
      },
    };

    vi.mocked(api.getDataConnector).mockResolvedValueOnce(connector);
    vi.mocked(api.listOperations).mockResolvedValueOnce({
      operations: [recentTargetFailure],
    });
    vi.mocked(api.fetchConnectorLogs).mockResolvedValueOnce({ entries: [] });

    const result = await runConnectorDiagnostics(
      healthyCollection,
      baseConfig,
      2
    );

    expect(result.status).toBe('error');
    expect(result.message).toContain('Sync Failures Detected');
  });

  it('accurately reports status="error" when connector state is FAILED or latestRun has an error', async () => {
    const failedConnector: DataConnector = {
      name: 'projects/123456789/locations/global/collections/sharepoint_prod/dataConnector',
      state: 'FAILED',
      dataSource: 'ms-sharepoint',
      latestRun: {
        error: { message: 'Missing Sites.Read.All permission in Entra ID' },
      },
    };

    vi.mocked(api.getDataConnector).mockResolvedValueOnce(failedConnector);
    vi.mocked(api.listOperations).mockResolvedValueOnce({ operations: [] });
    vi.mocked(api.fetchConnectorLogs).mockResolvedValueOnce({ entries: [] });

    const result = await runConnectorDiagnostics(
      healthyCollection,
      baseConfig,
      2
    );

    expect(result.status).toBe('error');
    expect(result.message).toContain('Missing Sites.Read.All permission');
  });

  it('derives portal-specific remediation steps via deriveConnectorRemediation and returns null for healthy or empty inputs', () => {
    expect(deriveConnectorRemediation(null)).toBeNull();
    expect(deriveConnectorRemediation('')).toBeNull();
    expect(
      deriveConnectorRemediation({
        connectorState: { state: 'ACTIVE', dataSource: 'jira' },
        diagnostics: { steps: [], warnings: [], errors: [] },
        rawOperations: [],
        recentLogs: [],
      })
    ).toBeNull();

    const entraTenantErr = deriveConnectorRemediation(
      'AADSTS700016: Application with identifier 111-222 was not found in the directory',
      'sharepoint'
    );
    expect(entraTenantErr).not.toBeNull();
    expect(entraTenantErr?.targetPortal).toBe('BOTH');
    expect(entraTenantErr?.title).toContain('AADSTS700016');
    expect(entraTenantErr?.steps.length).toBeGreaterThanOrEqual(2);

    const snowAclErr = deriveConnectorRemediation(
      '403 Forbidden: User lacks snc_read_only access on sys_db_object',
      'servicenow'
    );
    expect(snowAclErr?.targetPortal).toBe('VENDOR');
    expect(snowAclErr?.title).toContain('ServiceNow');

    const gcpIamErr = deriveConnectorRemediation(
      'IAM_PERMISSION_DENIED: caller does not have permission storage.objects.list',
      'gcs'
    );
    expect(gcpIamErr?.targetPortal).toBe('GCP');
    expect(gcpIamErr?.title).toContain('Google Cloud IAM');
  });

  it('ignores timeless rawOperations in deriveConnectorRemediation and downgrades severity to "warning" when an ACTIVE connector recovered in a newer latestRun (adv_4)', () => {
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const sixtyMinsAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // 1. Timeless failed operation on an ACTIVE healthy connector is ignored
    const timelessDetails = {
      connectorState: {
        state: 'ACTIVE',
        dataSource: 'ms-sharepoint',
      },
      diagnostics: { steps: [], warnings: [], errors: [] },
      rawOperations: [
        {
          name: 'projects/123/locations/global/collections/sharepoint_prod/operations/ancient-op',
          done: true,
          metadata: {},
          error: {
            code: 16,
            message: '401 Unauthorized: Historical error without metadata timestamps',
          },
        },
      ],
      recentLogs: [],
    };
    expect(deriveConnectorRemediation(timelessDetails)).toBeNull();

    // 2. Recovered connector (latestRun succeeded 10m ago after a transient 401 60m ago) produces warning severity, not error
    const recoveredDetails = {
      connectorState: {
        state: 'ACTIVE',
        dataSource: 'ms-sharepoint',
        latestRun: {
          state: 'SUCCEEDED',
          endTime: tenMinsAgo,
        },
      },
      diagnostics: {
        steps: [],
        warnings: ['1 earlier sync operation(s) failed prior to the latest healthy sync run'],
        errors: [],
      },
      rawOperations: [
        {
          name: 'projects/123/locations/global/collections/sharepoint_prod/operations/op-old',
          done: true,
          metadata: { updateTime: sixtyMinsAgo },
          error: {
            code: 16,
            message: '401 Unauthorized: Transient OAuth error before credential update',
          },
        },
      ],
      recentLogs: [
        {
          timestamp: sixtyMinsAgo,
          severity: 'ERROR',
          textPayload: '401 Unauthorized: Earlier auth failure',
        },
      ],
    };
    const recoveredRemediation = deriveConnectorRemediation(recoveredDetails);
    expect(recoveredRemediation).not.toBeNull();
    expect(recoveredRemediation?.severity).toBe('warning');
  });

  it('verifies IAM role prefix mappings for GCS, AlloyDB, Cloud SQL, Spanner, Bigtable, and Firestore in checkServiceAccountPermissions', async () => {
    vi.mocked(core.gapiRequest).mockResolvedValueOnce({
      bindings: [
        {
          role: 'roles/storage.objectViewer',
          members: ['serviceAccount:service-123456@gcp-sa-discoveryengine.iam.gserviceaccount.com'],
        },
        {
          role: 'roles/storage.objectCreator',
          members: ['serviceAccount:service-123456@gcp-sa-discoveryengine.iam.gserviceaccount.com'],
        },
        {
          role: 'roles/cloudsql.client',
          members: ['serviceAccount:service-123456@gcp-sa-discoveryengine.iam.gserviceaccount.com'],
        },
        {
          role: 'roles/spanner.databaseReader',
          members: ['serviceAccount:service-123456@gcp-sa-discoveryengine.iam.gserviceaccount.com'],
        },
        {
          role: 'roles/alloydb.client',
          members: ['serviceAccount:service-123456@gcp-sa-discoveryengine.iam.gserviceaccount.com'],
        },
        {
          role: 'roles/bigtable.reader',
          members: ['serviceAccount:service-123456@gcp-sa-discoveryengine.iam.gserviceaccount.com'],
        },
        {
          role: 'roles/datastore.viewer',
          members: ['serviceAccount:service-123456@gcp-sa-discoveryengine.iam.gserviceaccount.com'],
        },
        {
          role: 'roles/datastore.importExportAdmin',
          members: ['serviceAccount:service-123456@gcp-sa-discoveryengine.iam.gserviceaccount.com'],
        },
      ],
    });

    const res = await checkServiceAccountPermissions(
      'test-project',
      'service-123456@gcp-sa-discoveryengine.iam.gserviceaccount.com',
      [
        'discoveryengine.dataStores.get',
        'discoveryengine.collections.get',
        'storage.objects.list',
        'storage.objects.create',
        'cloudsql.instances.connect',
        'spanner.databases.read',
        'alloydb.instances.connect',
        'bigtable.tables.readRows',
        'datastore.entities.list',
        'datastore.databases.export',
      ]
    );

    expect(res.hasAll).toBe(true);
    expect(res.missing).toEqual([]);
  });
});

