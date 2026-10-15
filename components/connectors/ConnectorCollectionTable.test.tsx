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
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConnectorCollectionTable } from './ConnectorCollectionTable';
import { Collection } from '../../types';
import { ValidationResult } from './connectorDiagnostics';

const COLLECTIONS: Collection[] = [
  {
    name: 'projects/123/locations/global/collections/jira-prod',
    displayName: 'Jira Production',
  },
  {
    name: 'projects/123/locations/global/collections/confluence-kb',
    displayName: 'Confluence KB',
  },
  {
    name: 'projects/123/locations/global/collections/default_collection',
    displayName: 'Default Collection',
  },
];

const VALIDATION_RESULTS: Record<string, ValidationResult> = {
  'projects/123/locations/global/collections/jira-prod': {
    status: 'success',
    message: 'Connector healthy',
  },
  'projects/123/locations/global/collections/confluence-kb': {
    status: 'error',
    message: 'Sync failed',
  },
  'projects/123/locations/global/collections/default_collection': {
    status: 'n/a',
    message: 'Not applicable',
  },
};

describe('ConnectorCollectionTable', () => {
  const createProps = () => ({
    collections: COLLECTIONS,
    validationResults: VALIDATION_RESULTS,
    editingId: null,
    setEditingId: vi.fn(),
    editName: '',
    setEditName: vi.fn(),
    isSavingName: false,
    onSaveName: vi.fn(),
    getAssociatedApps: (name: string) => (name.endsWith('jira-prod') ? ['Support App'] : []),
    onCheckDataConnector: vi.fn(),
    onOpenDetails: vi.fn(),
    onSelectResult: vi.fn(),
    onDuplicateConnector: vi.fn(),
    onRequestDelete: vi.fn(),
  });

  it('filters collections by search query and diagnostic status', () => {
    render(<ConnectorCollectionTable {...createProps()} />);

    const searchInput = screen.getByLabelText('Search collections');
    fireEvent.change(searchInput, { target: { value: 'Support App' } });
    expect(screen.getByText('Jira Production')).toBeTruthy();
    expect(screen.queryByText('Confluence KB')).toBeNull();

    // Clear search and filter by FAIL status
    fireEvent.change(searchInput, { target: { value: '' } });
    const statusSelect = screen.getByLabelText('Filter collections by diagnostic status');
    fireEvent.change(statusSelect, { target: { value: 'error' } });

    expect(screen.getByText('Confluence KB')).toBeTruthy();
    expect(screen.queryByText('Jira Production')).toBeNull();
  });

  it('renders empty state for unmatched filter and disables N/A status pill button', () => {
    const props = createProps();
    render(<ConnectorCollectionTable {...props} />);

    const naBtn = screen.getByRole('button', { name: 'N/A' }) as HTMLButtonElement;
    expect(naBtn.disabled).toBe(true);
    fireEvent.click(naBtn);
    expect(props.onSelectResult).not.toHaveBeenCalled();

    const passBtn = screen.getByRole('button', { name: 'PASS' });
    fireEvent.click(passBtn);
    expect(props.onSelectResult).toHaveBeenCalledTimes(1);

    const searchInput = screen.getByLabelText('Search collections');
    fireEvent.change(searchInput, { target: { value: 'nonexistent_collection_xyz' } });
    expect(screen.getByText('No collections match your filter criteria.')).toBeTruthy();
  });

  it('renders Unverified (API Warning) instead of None for custom collections when associationWarning is present', () => {
    const props = createProps();
    render(
      <ConnectorCollectionTable
        {...props}
        associationWarning="Could not verify Associated Apps for collections: Engines lookup failed (403 Forbidden)."
      />
    );

    // Confluence KB has no matched apps and is not default_collection -> should render Unverified (API Warning)
    const unverifiedBadge = screen.getByTestId('connector-assoc-unverified-confluence-kb');
    expect(unverifiedBadge.textContent).toContain('Unverified (API Warning)');

    // default_collection still renders None when empty
    expect(screen.getByText('None')).toBeTruthy();
  });

  it('hides Clone buttons by default until the Experimental Clone toggle is enabled, then shows Clone only for eligible connectors', () => {
    const props = createProps();
    props.validationResults = {
      'projects/123/locations/global/collections/jira-prod': {
        status: 'success',
        message: 'Healthy',
        dataConnector: {
          name: 'projects/123/locations/global/collections/jira-prod/dataConnector',
          dataSource: 'servicenow',
          connectorType: 'THIRD_PARTY',
          connectorModes: ['DATA_INGESTION'],
        },
      },
      'projects/123/locations/global/collections/confluence-kb': {
        status: 'success',
        message: 'Healthy',
        dataConnector: {
          name: 'projects/123/locations/global/collections/confluence-kb/dataConnector',
          dataSource: 'confluence',
          connectorType: 'THIRD_PARTY',
          connectorModes: ['DATA_INGESTION'],
        },
      },
      'projects/123/locations/global/collections/default_collection': {
        status: 'n/a',
        message: 'Not applicable',
      },
    };

    render(<ConnectorCollectionTable {...props} />);

    // Experimental badge and toggle checkbox are rendered in the toolbar, off by default
    expect(screen.getByText('Experimental')).toBeTruthy();
    const cloneToggle = screen.getByLabelText('Enable experimental connector cloning') as HTMLInputElement;
    expect(cloneToggle.checked).toBe(false);
    expect(screen.queryAllByRole('button', { name: 'Clone' })).toHaveLength(0);

    // Enable the experimental clone toggle
    fireEvent.click(cloneToggle);
    expect(cloneToggle.checked).toBe(true);

    // Only servicenow (headless password/2LO ingestion) should have a Clone button;
    // confluence DATA_INGESTION requires a 3LO browser refresh_token and default_collection is excluded.
    const cloneButtons = screen.getAllByRole('button', { name: 'Clone' });
    expect(cloneButtons).toHaveLength(1);
    fireEvent.click(cloneButtons[0]);
    expect(props.onDuplicateConnector).toHaveBeenCalledWith(COLLECTIONS[0]);
  });
});

import {
  getConnectorCloneEligibility,
  discoverFields,
  buildDuplicatePayload,
} from './duplicate/duplicateFieldUtils';
import DuplicateConnectorModal from './DuplicateConnectorModal';
import * as apiService from '../../services/apiService';
import { waitFor } from '@testing-library/react';

describe('Connector Clone Eligibility & Payload Construction', () => {
  it('allows cloning Federated/Actions connectors and headless 2LO/Password/MCP/1P ingestion connectors', () => {
    // 1. Federated & Actions 3P connectors (per-user OAuth happens at query time)
    expect(
      getConnectorCloneEligibility({
        dataSource: 'salesforce',
        connectorType: 'THIRD_PARTY_FEDERATED',
        connectorModes: ['FEDERATED', 'ACTIONS'],
      }).canClone
    ).toBe(true);

    expect(
      getConnectorCloneEligibility({
        dataSource: 'slack',
        connectorModes: ['FEDERATED'],
      }).canClone
    ).toBe(true);

    // 2. 2-Legged OAuth Ingestion (Entra ID, Teams, Outlook)
    expect(
      getConnectorCloneEligibility({
        dataSource: 'entra_id',
        connectorType: 'THIRD_PARTY',
        connectorModes: ['DATA_INGESTION'],
      }).canClone
    ).toBe(true);

    expect(
      getConnectorCloneEligibility({
        dataSource: 'onedrive',
        connectorType: 'THIRD_PARTY',
        connectorModes: ['DATA_INGESTION'],
        params: { auth_type: 'OAUTH_TWO_LEGGED' },
      }).canClone
    ).toBe(true);

    // 3. ServiceNow & Custom MCP
    expect(
      getConnectorCloneEligibility({
        dataSource: 'servicenow',
        connectorType: 'THIRD_PARTY',
        connectorModes: ['DATA_INGESTION'],
      }).canClone
    ).toBe(true);

    expect(
      getConnectorCloneEligibility({
        dataSource: 'custom_mcp',
        connectorModes: ['ACTIONS'],
      }).canClone
    ).toBe(true);
  });

  it('rejects connectors requiring a browser OAuth token or Google Workspace V2 Console setup', () => {
    // Negative test 1: Google Workspace V2 (dataSourceVersion: 2 stripped by public ESF)
    const gdriveV2 = getConnectorCloneEligibility({
      dataSource: 'google_drive',
      dataSourceVersion: 2,
      connectorModes: ['FEDERATED', 'ACTIONS'],
      params: { use_google_managed_oauth: true },
    });
    expect(gdriveV2.canClone).toBe(false);
    expect(gdriveV2.reason).toContain('dataSourceVersion: 2');

    // Negative test 2: 3LO Data Ingestion connectors requiring browser refresh_token
    const jiraIngestion = getConnectorCloneEligibility({
      dataSource: 'jira',
      connectorType: 'THIRD_PARTY',
      connectorModes: ['DATA_INGESTION'],
    });
    expect(jiraIngestion.canClone).toBe(false);
    expect(jiraIngestion.reason).toContain('browser OAuth token');

    const sharepointIngestion = getConnectorCloneEligibility({
      dataSource: 'sharepoint',
      connectorType: 'THIRD_PARTY',
      connectorModes: ['DATA_INGESTION'],
    });
    expect(sharepointIngestion.canClone).toBe(false);

    // Negative test 3: Empty / malformed connectorState
    expect(getConnectorCloneEligibility(null).canClone).toBe(false);
    expect(getConnectorCloneEligibility({}).canClone).toBe(false);
  });

  it('discovers missing/redacted secrets without prompting for browser refresh_token or auth_key and builds cross-project payload', () => {
    const sourceServiceNow = {
      name: 'projects/source-proj/locations/global/collections/snow-1/dataConnector',
      dataSource: 'servicenow',
      connectorType: 'THIRD_PARTY_FEDERATED',
      connectorModes: ['FEDERATED', 'ACTIONS'],
      params: {
        instance_uri: 'https://acme.service-now.com',
      },
      actionConfig: {
        isActionConfigured: true,
        secretId: 'projects/source-proj/secrets/old-secret',
        serviceName: 'old-service',
        actionParams: {
          auth_key: 'OAuth',
          auth_type: 'OAUTH',
          instance_uri: 'https://acme.service-now.com',
        },
      },
      bapConfig: {
        supportedConnectorModes: ['ACTIONS'],
        enabledActions: ['create_incident'],
      },
    };

    const fields = discoverFields(sourceServiceNow, true);
    const keys = fields.map((f) => `${f.location}.${f.key}`);

    // Should include pre-populated instance_uri and require redacted client_id, client_secret, user_account, and password
    expect(keys).toContain('params.instance_uri');
    expect(keys).toContain('params.client_id');
    expect(keys).toContain('params.client_secret');
    expect(keys).toContain('params.user_account');
    expect(keys).toContain('params.password');
    // Must NOT prompt for browser refresh_token or treat auth_key as a password field
    expect(keys).not.toContain('params.refresh_token');
    expect(keys).not.toContain('actionParams.auth_key');
    expect(keys).not.toContain('params.auth_key');

    const payload = buildDuplicatePayload({
      sourceConnectorState: sourceServiceNow,
      targetCollectionId: 'snow-clone',
      targetCollectionDisplayName: 'Cloned ServiceNow',
      fieldValues: {
        'params.instance_uri': 'https://acme.service-now.com',
        'params.client_id': 'new-client-id',
        'params.client_secret': 'new-super-secret',
        'params.user_account': 'svc_gemini',
        'params.password': 'new-password-123',
      },
      includeActions: true,
    });

    expect(payload?.collectionId).toBe('snow-clone');
    expect(payload?.dataConnector.params.client_id).toBe('new-client-id');
    expect(payload?.dataConnector.params.client_secret).toBe('new-super-secret');
    expect(payload?.dataConnector.params.user_account).toBe('svc_gemini');
    expect(payload?.dataConnector.params.password).toBe('new-password-123');
    // ActionConfig should have synchronized credentials, preserved auth_key: 'OAuth', OAuth endpoints, createBapConnection: true, and stripped old project secretId
    expect(payload?.dataConnector.actionConfig?.actionParams?.client_id).toBe('new-client-id');
    expect(payload?.dataConnector.actionConfig?.actionParams?.client_secret).toBe('new-super-secret');
    expect(payload?.dataConnector.actionConfig?.actionParams?.auth_key).toBe('OAuth');
    expect(payload?.dataConnector.actionConfig?.actionParams?.auth_type).toBe('OAUTH');
    expect(payload?.dataConnector.actionConfig?.actionParams?.auth_uri).toBe(
      'https://acme.service-now.com/oauth_auth.do'
    );
    expect(payload?.dataConnector.actionConfig?.actionParams?.token_uri).toBe(
      'https://acme.service-now.com/oauth_token.do'
    );
    expect(payload?.dataConnector.actionConfig?.createBapConnection).toBe(true);
    expect(payload?.dataConnector.actionConfig?.secretId).toBeUndefined();
  });

  it('walks through DuplicateConnectorModal wizard and calls setUpDataConnector in target project', async () => {
    const setUpSpy = vi
      .spyOn(apiService, 'setUpDataConnector')
      .mockResolvedValue({ name: 'operations/op-1', done: true });
    const onSuccess = vi.fn();

    render(
      <DuplicateConnectorModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={onSuccess}
        sourceCollectionName="projects/p-source/locations/global/collections/entra-prod"
        sourceConnectorState={{
          dataSource: 'entra_id',
          connectorType: 'THIRD_PARTY',
          connectorModes: ['DATA_INGESTION'],
          params: {
            tenant_id: '11111111-2222-3333-4444-555555555555',
            client_id: 'entra-app-id',
          },
          entities: [{ entityName: 'user' }],
        }}
        currentProjectId="p-source"
        currentLocation="global"
      />
    );

    // Step 1: Destination -> change target project to p-target
    const projectInput = screen.getByPlaceholderText('e.g. my-target-gcp-project');
    fireEvent.change(projectInput, { target: { value: 'p-target-999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Step 2: Identifier -> proceed to Step 3
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Step 3: Credentials -> try clicking Next without entering Client Secret (should fail validation)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(/Credential 'Client Secret \(OAuth\)' is required/i)).toBeTruthy();

    // Fill Client Secret and proceed to Step 4
    const secretInput = screen.getByPlaceholderText('Enter Client Secret (OAuth)');
    fireEvent.change(secretInput, { target: { value: 'entra-secret-xyz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Step 4: Review and Provision
    const provisionBtn = screen.getByRole('button', { name: /Provision Connector/i });
    fireEvent.click(provisionBtn);

    await waitFor(() => {
      expect(setUpSpy).toHaveBeenCalledTimes(1);
    });

    expect(setUpSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionId: 'entra-prod-clone',
        dataConnector: expect.objectContaining({
          dataSource: 'entra_id',
          params: expect.objectContaining({
            tenant_id: '11111111-2222-3333-4444-555555555555',
            client_id: 'entra-app-id',
            client_secret: 'entra-secret-xyz',
            auth_type: 'OAUTH_TWO_LEGGED',
          }),
        }),
      }),
      expect.objectContaining({
        projectId: 'p-target-999',
        appLocation: 'global',
      })
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
    setUpSpy.mockRestore();
  });

  it('strips refresh_token and auth_type from onedrive top-level params while preserving valid schema keys', () => {
    const sourceOneDrive = {
      name: 'projects/p-source/locations/global/collections/onedrive-1/dataConnector',
      dataSource: 'onedrive',
      connectorType: 'THIRD_PARTY_FEDERATED',
      connectorModes: ['FEDERATED', 'ACTIONS'],
      params: {
        instance_uri: 'https://contoso-my.sharepoint.com',
        tenant_id: 'aaaa-bbbb-cccc',
        client_id: 'onedrive-client-id',
        auth_type: 'OAUTH',
        o365_environment_type: 'com',
        refresh_token: '',
        max_qps: 10,
      },
      actionConfig: {
        isActionConfigured: true,
        actionParams: {
          instance_uri: 'https://contoso-my.sharepoint.com',
          tenant_id: 'aaaa-bbbb-cccc',
          client_id: 'onedrive-client-id',
        },
      },
      bapConfig: {
        supportedConnectorModes: ['ACTIONS'],
        enabledActions: ['upload_file'],
      },
    };

    const payload = buildDuplicatePayload({
      sourceConnectorState: sourceOneDrive,
      targetCollectionId: 'onedrive-clone',
      targetCollectionDisplayName: 'OneDrive Clone',
      fieldValues: {
        'params.instance_uri': 'https://contoso-my.sharepoint.com',
        'params.tenant_id': 'aaaa-bbbb-cccc',
        'params.client_id': 'onedrive-client-id',
        'params.client_secret': 'onedrive-secret-456',
      },
      includeActions: true,
    });

    const allowedOneDriveParams = [
      'client_id',
      'client_secret',
      'tenant_id',
      'instance_uri',
      'picker_config_provider',
      'sync_since',
      'max_qps',
      'decrypt_mip_files',
      'structured_search_filter',
      'structured_exclusion_search_filter',
    ];

    const emittedParamKeys = Object.keys(payload?.dataConnector.params || {});
    for (const key of emittedParamKeys) {
      expect(allowedOneDriveParams).toContain(key);
    }

    expect(payload?.dataConnector.params).not.toHaveProperty('refresh_token');
    expect(payload?.dataConnector.params).not.toHaveProperty('auth_type');
    expect(payload?.dataConnector.params).not.toHaveProperty('o365_environment_type');
    expect(payload?.dataConnector.params.client_id).toBe('onedrive-client-id');
    expect(payload?.dataConnector.params.client_secret).toBe('onedrive-secret-456');
    expect(payload?.dataConnector.params.tenant_id).toBe('aaaa-bbbb-cccc');
    expect(payload?.dataConnector.params.instance_uri).toBe('https://contoso-my.sharepoint.com');
    expect(payload?.dataConnector.params.max_qps).toBe(10);

    // Action params for OneDrive still keep auth_type and o365_environment_type, but never refresh_token
    expect(payload?.dataConnector.actionConfig?.actionParams?.auth_type).toBe('OAUTH');
    expect(payload?.dataConnector.actionConfig?.actionParams?.o365_environment_type).toBe('com');
    expect(payload?.dataConnector.actionConfig?.actionParams).not.toHaveProperty('refresh_token');
  });

  it('rejects console-only and native GCP storage connectors (google_docs, file_upload, notebooklm, google_sites, gcp_fhir, cloud_identity, msft)', () => {
    for (const unsupported of [
      'google_docs',
      'file_upload',
      'notebooklm',
      'google_sites',
      'gcp_fhir',
      'healthcare_fhir',
      'cloud_storage',
      'cloud_identity',
      'msft',
    ]) {
      const res = getConnectorCloneEligibility({
        dataSource: unsupported,
        connectorModes: ['FEDERATED', 'ACTIONS'],
      });
      expect(res.canClone).toBe(false);
      expect(res.eligible).toBe(false);
      expect(res.reason).toBeTruthy();
    }
  });

  it('filters internal system keys and avoids false-positive password detection on non-secret key/token fields', () => {
    const sourceWithNonSecretKeyFields = {
      dataSource: 'workday',
      connectorModes: ['DATA_INGESTION'],
      params: {
        client_id: 'wd-client',
        token_endpoint_uri: 'https://wd.example.com/oauth2/token',
        query_service_endpoint_uri: 'https://wd.example.com/ccx/service',
        key_property_mappings: 'id=worker_id',
        key_id: 'kid-123',
        unused_auth_param: 'should_be_ignored',
        p4sa_client_id: 'service-123@gcp-sa.iam.gserviceaccount.com',
        admin_auth_credentials_secret_id: 'projects/1/secrets/s',
        bap_version: 'V2',
        connector_version: '2',
        create_bap_connection: true,
        use_static_secrets: false,
        service_name: 'wd-svc',
        secret_id: 'projects/1/secrets/s2',
      },
    };

    const fields = discoverFields(sourceWithNonSecretKeyFields, true);
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));

    // Internal system keys must be completely excluded from UI fields
    for (const sysKey of [
      'unused_auth_param',
      'p4sa_client_id',
      'admin_auth_credentials_secret_id',
      'bap_version',
      'connector_version',
      'create_bap_connection',
      'use_static_secrets',
      'service_name',
      'secret_id',
    ]) {
      expect(byKey[sysKey]).toBeUndefined();
    }

    // Non-secret fields containing "key" or "token" must remain type="text" with their default values preserved
    expect(byKey.token_endpoint_uri?.type).toBe('text');
    expect(byKey.token_endpoint_uri?.defaultValue).toBe('https://wd.example.com/oauth2/token');
    expect(byKey.key_property_mappings?.type).toBe('text');
    expect(byKey.key_property_mappings?.defaultValue).toBe('id=worker_id');
    expect(byKey.key_id?.type).toBe('text');
    expect(byKey.key_id?.defaultValue).toBe('kid-123');

    // Workday v1 DATA_INGESTION explicitly requires client_secret and refresh_token as password fields
    expect(byKey.client_secret?.type).toBe('password');
    expect(byKey.refresh_token?.type).toBe('password');
    expect(byKey.refresh_token?.required).toBe(true);
  });

  it('preserves actionConfig and bapConfig for Jira and Confluence and separates Confluence Basic Auth from top-level params', () => {
    // 1. Jira with OAuth + Actions
    const sourceJira = {
      dataSource: 'jira',
      connectorType: 'THIRD_PARTY_FEDERATED',
      connectorModes: ['FEDERATED', 'ACTIONS'],
      params: {
        instance_uri: 'https://acme.atlassian.net',
        instance_id: 'cloud-uuid-1234',
        client_id: 'jira-oauth-client',
      },
      actionConfig: {
        isActionConfigured: true,
        secretId: 'projects/old/secrets/jira-sec',
        actionParams: {
          auth_type: 'OAUTH',
          instance_uri: 'https://acme.atlassian.net',
          instance_id: 'cloud-uuid-1234',
          client_id: 'jira-oauth-client',
        },
      },
      bapConfig: {
        supportedConnectorModes: ['ACTIONS'],
        enabledActions: ['create_issue', 'update_issue'],
      },
    };

    const jiraFields = discoverFields(sourceJira, true);
    const jiraFieldKeys = jiraFields.map((f) => `${f.location}.${f.key}`);
    expect(jiraFieldKeys).toContain('params.instance_uri');
    expect(jiraFieldKeys).toContain('params.instance_id');
    expect(jiraFieldKeys).toContain('params.client_id');
    expect(jiraFieldKeys).toContain('params.client_secret');

    const jiraPayload = buildDuplicatePayload({
      sourceConnectorState: sourceJira,
      targetCollectionId: 'jira-clone',
      targetCollectionDisplayName: 'Jira Clone',
      fieldValues: {
        'params.instance_uri': 'https://acme.atlassian.net',
        'params.instance_id': 'cloud-uuid-1234',
        'params.client_id': 'jira-oauth-client',
        'params.client_secret': 'jira-oauth-secret-999',
      },
      includeActions: true,
    });

    expect(jiraPayload?.dataConnector.actionConfig).toBeDefined();
    expect(jiraPayload?.dataConnector.actionConfig?.secretId).toBeUndefined();
    expect(jiraPayload?.dataConnector.actionConfig?.actionParams?.client_secret).toBe(
      'jira-oauth-secret-999'
    );
    expect(jiraPayload?.dataConnector.actionConfig?.actionParams?.instance_id).toBe(
      'cloud-uuid-1234'
    );
    expect(jiraPayload?.dataConnector.bapConfig?.enabledActions).toEqual([
      'create_issue',
      'update_issue',
    ]);

    // 2. Confluence with OAuth in params and BASIC_AUTH in actionParams
    const sourceConfluence = {
      dataSource: 'confluence',
      connectorType: 'THIRD_PARTY_FEDERATED',
      connectorModes: ['FEDERATED', 'ACTIONS'],
      params: {
        instance_uri: 'https://acme.atlassian.net/wiki',
        client_id: 'conf-oauth-id',
      },
      actionConfig: {
        isActionConfigured: true,
        actionParams: {
          auth_type: 'BASIC_AUTH',
          user_account: 'bot@acme.com',
        },
      },
      bapConfig: {
        supportedConnectorModes: ['ACTIONS'],
        enabledActions: ['create_page'],
      },
    };

    const confFields = discoverFields(sourceConfluence, true);
    const confKeys = confFields.map((f) => `${f.location}.${f.key}`);
    expect(confKeys).toContain('params.instance_uri');
    expect(confKeys).toContain('params.client_id');
    expect(confKeys).toContain('params.client_secret');
    expect(confKeys).toContain('actionParams.user_account');
    expect(confKeys).toContain('actionParams.password');

    const confPayload = buildDuplicatePayload({
      sourceConnectorState: sourceConfluence,
      targetCollectionId: 'conf-clone',
      targetCollectionDisplayName: 'Confluence Clone',
      fieldValues: {
        'params.instance_uri': 'https://acme.atlassian.net/wiki',
        'params.client_id': 'conf-oauth-id',
        'params.client_secret': 'conf-oauth-secret',
        'actionParams.user_account': 'bot@acme.com',
        'actionParams.password': 'atlassian-api-token',
      },
      includeActions: true,
    });

    // Confluence top-level params must NEVER contain user_account or password
    expect(confPayload?.dataConnector.params).not.toHaveProperty('user_account');
    expect(confPayload?.dataConnector.params).not.toHaveProperty('password');
    expect(confPayload?.dataConnector.params.client_id).toBe('conf-oauth-id');
    expect(confPayload?.dataConnector.params.client_secret).toBe('conf-oauth-secret');
    // Confluence actionParams must contain user_account and password, plus destinationConfigs url
    expect(confPayload?.dataConnector.actionConfig?.actionParams?.user_account).toBe(
      'bot@acme.com'
    );
    expect(confPayload?.dataConnector.actionConfig?.actionParams?.password).toBe(
      'atlassian-api-token'
    );
    expect(confPayload?.dataConnector.bapConfig?.enabledActions).toEqual(['create_page']);
    expect(confPayload?.dataConnector.destinationConfigs).toEqual([
      { key: 'url', destinations: [{ host: 'https://acme.atlassian.net/wiki' }] },
    ]);
  });

  it('handles ServiceNow v3 ByoOAuth without requiring basic auth user_account/password', () => {
    const sourceSnowV3 = {
      dataSource: 'servicenow',
      connectorType: 'THIRD_PARTY_FEDERATED',
      connectorModes: ['FEDERATED', 'ACTIONS'],
      params: {},
      actionConfig: {
        isActionConfigured: true,
        actionParams: {
          auth_key: 'ByoOAuth',
          instance_uri: 'https://v3.service-now.com',
          client_id: 'snow-v3-client',
        },
      },
    };

    const fields = discoverFields(sourceSnowV3, true);
    const keys = fields.map((f) => `${f.location}.${f.key}`);
    expect(keys).toContain('actionParams.instance_uri');
    expect(keys).toContain('actionParams.client_id');
    expect(keys).toContain('actionParams.client_secret');
    expect(keys).not.toContain('params.user_account');
    expect(keys).not.toContain('actionParams.user_account');
    expect(keys).not.toContain('params.password');

    const payload = buildDuplicatePayload({
      sourceConnectorState: sourceSnowV3,
      targetCollectionId: 'snow-v3-clone',
      targetCollectionDisplayName: 'Snow V3 Clone',
      fieldValues: {
        'actionParams.instance_uri': 'https://v3.service-now.com',
        'actionParams.client_id': 'snow-v3-client',
        'actionParams.client_secret': 'snow-v3-secret',
      },
      includeActions: true,
    });

    expect(payload?.dataConnector.params).toEqual({});
    expect(payload?.dataConnector.actionConfig?.actionParams?.client_id).toBe('snow-v3-client');
    expect(payload?.dataConnector.actionConfig?.actionParams?.client_secret).toBe(
      'snow-v3-secret'
    );
  });

  it('routes action-only auth connectors (notion, gitlab, custom_mcp, looker_mcp, airtable, concur, oracle_netsuite, workday v2, peoplesoft, github) to the exact schema locations and builds destinationConfigs', () => {
    // 1. Notion (unused_auth_param -> actionParams.api_token only)
    const sourceNotion = {
      dataSource: 'notion',
      connectorModes: ['FEDERATED', 'ACTIONS'],
      params: { unused_auth_param: 'true' },
      actionConfig: { isActionConfigured: true, actionParams: {} },
    };
    const notionFields = discoverFields(sourceNotion, true);
    expect(notionFields.map((f) => `${f.location}.${f.key}`)).toEqual(['actionParams.api_token']);
    const notionPayload = buildDuplicatePayload({
      sourceConnectorState: sourceNotion,
      targetCollectionId: 'notion-clone',
      targetCollectionDisplayName: 'Notion Clone',
      fieldValues: { 'actionParams.api_token': 'ntn_secret_123' },
      includeActions: true,
    });
    expect(notionPayload?.dataConnector.params).toEqual({});
    expect(notionPayload?.dataConnector.actionConfig?.actionParams?.api_token).toBe(
      'ntn_secret_123'
    );

    // 2. GitLab Federated/Actions -> actionParams.api_token + destinationConfigs base_url
    const sourceGitLab = {
      dataSource: 'gitlab',
      connectorModes: ['FEDERATED', 'ACTIONS'],
      params: {},
      actionConfig: {
        isActionConfigured: true,
        actionParams: { instance_uri: 'https://gitlab.acme.com' },
      },
    };
    const gitlabFields = discoverFields(sourceGitLab, true);
    expect(gitlabFields.map((f) => `${f.location}.${f.key}`)).toEqual([
      'actionParams.instance_uri',
      'actionParams.api_token',
    ]);
    const gitlabPayload = buildDuplicatePayload({
      sourceConnectorState: sourceGitLab,
      targetCollectionId: 'gitlab-clone',
      targetCollectionDisplayName: 'GitLab Clone',
      fieldValues: {
        'actionParams.instance_uri': 'https://gitlab.acme.com',
        'actionParams.api_token': 'glpat-12345',
      },
      includeActions: true,
    });
    expect(gitlabPayload?.dataConnector.params).toEqual({});
    expect(gitlabPayload?.dataConnector.actionConfig?.actionParams?.api_token).toBe('glpat-12345');
    expect(gitlabPayload?.dataConnector.destinationConfigs).toEqual([
      { key: 'base_url', destinations: [{ host: 'https://gitlab.acme.com' }] },
    ]);

    // 3. GitHub with Actions PAT -> PAT stays in actionParams, OAuth stays in params
    const sourceGitHub = {
      dataSource: 'github',
      connectorModes: ['FEDERATED', 'ACTIONS'],
      params: {
        instance_uri: 'https://github.com/acme',
        client_id: 'gh-client-id',
      },
      actionConfig: {
        isActionConfigured: true,
        actionParams: {
          auth_key: 'PAT',
          personal_access_token: '***',
        },
      },
    };
    const ghFields = discoverFields(sourceGitHub, true);
    expect(ghFields.map((f) => `${f.location}.${f.key}`)).toContain(
      'actionParams.personal_access_token'
    );
    const ghPayload = buildDuplicatePayload({
      sourceConnectorState: sourceGitHub,
      targetCollectionId: 'gh-clone',
      targetCollectionDisplayName: 'GitHub Clone',
      fieldValues: {
        'params.instance_uri': 'https://github.com/acme',
        'params.client_id': 'gh-client-id',
        'params.client_secret': 'gh-oauth-secret',
        'actionParams.personal_access_token': 'ghp_pat_token',
      },
      includeActions: true,
    });
    expect(ghPayload?.dataConnector.params).not.toHaveProperty('personal_access_token');
    expect(ghPayload?.dataConnector.actionConfig?.actionParams?.personal_access_token).toBe(
      'ghp_pat_token'
    );

    // 4. Custom MCP with auth_key="api_token" -> createBapConnection: false & actionParams only
    const sourceCustomMcp = {
      dataSource: 'custom_mcp',
      connectorModes: ['ACTIONS'],
      params: {},
      actionConfig: {
        isActionConfigured: true,
        actionParams: {
          auth_key: 'api_token',
          instance_uri: 'https://mcp.acme.internal/sse',
        },
      },
    };
    const mcpFields = discoverFields(sourceCustomMcp, true);
    expect(mcpFields.map((f) => `${f.location}.${f.key}`)).toEqual([
      'actionParams.instance_uri',
      'actionParams.api_token',
    ]);
    const mcpPayload = buildDuplicatePayload({
      sourceConnectorState: sourceCustomMcp,
      targetCollectionId: 'mcp-clone',
      targetCollectionDisplayName: 'MCP Clone',
      fieldValues: {
        'actionParams.instance_uri': 'https://mcp.acme.internal/sse',
        'actionParams.api_token': 'mcp-secret-tok',
      },
      includeActions: true,
    });
    expect(mcpPayload?.dataConnector.params).toEqual({});
    expect(mcpPayload?.dataConnector.actionConfig?.createBapConnection).toBe(false);
    expect(mcpPayload?.dataConnector.actionConfig?.actionParams?.api_token).toBe('mcp-secret-tok');

    // 5. Looker MCP preserves relative mcp_endpoint and strips accidental full URL override
    const sourceLookerMcp = {
      dataSource: 'looker_mcp',
      connectorModes: ['ACTIONS'],
      params: {},
      actionConfig: {
        isActionConfigured: true,
        actionParams: {
          instance_uri: 'https://looker.acme.com',
          mcp_endpoint: '/api/mcp',
          client_id: 'looker-id',
        },
      },
    };
    const lookerPayload = buildDuplicatePayload({
      sourceConnectorState: sourceLookerMcp,
      targetCollectionId: 'looker-clone',
      targetCollectionDisplayName: 'Looker Clone',
      fieldValues: {
        'actionParams.instance_uri': 'https://looker.acme.com',
        'actionParams.mcp_endpoint': 'https://looker.acme.com/api/mcp',
        'actionParams.client_id': 'looker-id',
        'actionParams.client_secret': 'looker-secret',
      },
      includeActions: true,
    });
    expect(lookerPayload?.dataConnector.actionConfig?.actionParams?.mcp_endpoint).toBe('/api/mcp');

    // 6. PeopleSoft generates both host_address and host_address_search destinationConfigs
    const sourcePeopleSoft = {
      dataSource: 'peoplesoft',
      connectorModes: ['FEDERATED', 'ACTIONS'],
      params: {
        instance_uri: 'https://ps.acme.com',
        user_account: 'PSADMIN',
      },
      actionConfig: { isActionConfigured: true, actionParams: {} },
    };
    const psPayload = buildDuplicatePayload({
      sourceConnectorState: sourcePeopleSoft,
      targetCollectionId: 'ps-clone',
      targetCollectionDisplayName: 'PeopleSoft Clone',
      fieldValues: {
        'params.instance_uri': 'https://ps.acme.com',
        'params.user_account': 'PSADMIN',
        'params.password': 'ps-pass',
      },
      includeActions: true,
    });
    expect(psPayload?.dataConnector.destinationConfigs).toEqual([
      { key: 'host_address', destinations: [{ host: 'https://ps.acme.com' }] },
      { key: 'host_address_search', destinations: [{ host: 'https://ps.acme.com' }] },
    ]);
  });

  it('synchronizes redacted credentials (user_account, password, api_token, tenant_id) into actionParams', () => {
    // 1. ServiceNow v1/v2 Basic/OAuthPassword where user_account & password were redacted from actionParams
    const sourceServiceNow = {
      dataSource: 'servicenow',
      connectorModes: ['FEDERATED', 'ACTIONS'],
      params: {
        instance_uri: 'https://corp.service-now.com',
      },
      actionConfig: {
        isActionConfigured: true,
        actionParams: {
          auth_key: 'OAuth',
          auth_type: 'OAUTH',
        },
      },
    };

    const snowPayload = buildDuplicatePayload({
      sourceConnectorState: sourceServiceNow,
      targetCollectionId: 'snow-clone-2',
      targetCollectionDisplayName: 'Snow Clone 2',
      fieldValues: {
        'params.instance_uri': 'https://corp.service-now.com',
        'params.client_id': 'snow-client-123',
        'params.client_secret': 'snow-secret-abc',
        'params.user_account': 'admin_user',
        'params.password': 'admin_pass_999',
      },
      includeActions: true,
    });

    expect(snowPayload?.dataConnector.actionConfig?.actionParams?.client_id).toBe('snow-client-123');
    expect(snowPayload?.dataConnector.actionConfig?.actionParams?.client_secret).toBe('snow-secret-abc');
    expect(snowPayload?.dataConnector.actionConfig?.actionParams?.user_account).toBe('admin_user');
    expect(snowPayload?.dataConnector.actionConfig?.actionParams?.password).toBe('admin_pass_999');

    // 2. Linear v1 / Monday / PagerDuty where api_key or api_token were redacted from actionParams
    const sourceLinearV1 = {
      dataSource: 'linear',
      connectorModes: ['FEDERATED', 'ACTIONS'],
      params: {},
      actionConfig: {
        isActionConfigured: true,
      },
    };

    const linearPayload = buildDuplicatePayload({
      sourceConnectorState: sourceLinearV1,
      targetCollectionId: 'linear-clone',
      targetCollectionDisplayName: 'Linear Clone',
      fieldValues: {
        'params.api_key': 'lin_api_key_123',
      },
      includeActions: true,
    });

    expect(linearPayload?.dataConnector.actionConfig?.actionParams?.api_key).toBe('lin_api_key_123');
  });

  it('preserves Microsoft auth_key, auth_type, auth_uri, token_uri, auto-updates tenant in URIs, and normalizes BEARER_AUTH_TOKEN', () => {
    // 1. Microsoft SharePoint with auth_key: "OAuth_secret" and login.microsoftonline.com URIs
    const sourceSharePoint = {
      dataSource: 'sharepoint',
      connectorModes: ['DATA_INGESTION', 'ACTIONS'],
      params: {
        instance_uri: 'https://contoso.sharepoint.com',
        tenant_id: 'old-tenant-1111',
        client_id: 'sp-client-id',
        auth_key: 'OAuth_secret',
        auth_type: 'OAUTH',
        auth_uri: 'https://login.microsoftonline.com/old-tenant-1111/oauth2/v2.0/authorize',
        token_uri: 'https://login.microsoftonline.com/old-tenant-1111/oauth2/v2.0/token',
      },
      actionConfig: {
        isActionConfigured: true,
        actionParams: {
          instance_uri: 'https://contoso.sharepoint.com',
          tenant_id: 'old-tenant-1111',
          auth_key: 'ByoOAuth',
          auth_type: 'OAUTH',
          auth_uri: 'https://login.microsoftonline.com/old-tenant-1111/oauth2/v2.0/authorize',
          token_uri: 'https://login.microsoftonline.com/old-tenant-1111/oauth2/v2.0/token',
        },
      },
    };

    const spPayload = buildDuplicatePayload({
      sourceConnectorState: sourceSharePoint,
      targetCollectionId: 'sp-clone',
      targetCollectionDisplayName: 'SharePoint Clone',
      fieldValues: {
        'params.instance_uri': 'https://contoso.sharepoint.com',
        'params.tenant_id': 'new-tenant-2222',
        'params.client_id': 'sp-client-id',
        'params.client_secret': 'new-sp-secret',
      },
      includeActions: true,
    });

    // Whitelist must NOT strip auth_key, auth_type, auth_uri, token_uri
    expect(spPayload?.dataConnector.params.auth_key).toBe('OAuth_secret');
    expect(spPayload?.dataConnector.params.auth_type).toBe('OAUTH');
    expect(spPayload?.dataConnector.params.auth_uri).toBe(
      'https://login.microsoftonline.com/new-tenant-2222/oauth2/v2.0/authorize'
    );
    expect(spPayload?.dataConnector.params.token_uri).toBe(
      'https://login.microsoftonline.com/new-tenant-2222/oauth2/v2.0/token'
    );
    expect(spPayload?.dataConnector.actionConfig?.actionParams?.auth_key).toBe('ByoOAuth');
    expect(spPayload?.dataConnector.actionConfig?.actionParams?.auth_uri).toBe(
      'https://login.microsoftonline.com/new-tenant-2222/oauth2/v2.0/authorize'
    );
    expect(spPayload?.dataConnector.actionConfig?.actionParams?.token_uri).toBe(
      'https://login.microsoftonline.com/new-tenant-2222/oauth2/v2.0/token'
    );

    // 2. BEARER_AUTH_TOKEN normalization to API_TOKEN for coda / pagerduty / notion
    const sourceCoda = {
      dataSource: 'coda',
      connectorModes: ['DATA_INGESTION'],
      params: {
        auth_type: 'BEARER_AUTH_TOKEN',
      },
    };
    const codaPayload = buildDuplicatePayload({
      sourceConnectorState: sourceCoda,
      targetCollectionId: 'coda-clone',
      targetCollectionDisplayName: 'Coda Clone',
      fieldValues: {
        'params.api_token': 'coda-tok-123',
      },
      includeActions: false,
    });
    expect(codaPayload?.dataConnector.params.auth_type).toBe('API_TOKEN');
  });

  it('routes credentials to actionParams for V2/V3 BAP connectors (slack, box, salesforce, linear, monday, asana)', () => {
    // Slack V2/V3 BAP connector in FEDERATED, ACTIONS mode without DATA_INGESTION
    const sourceSlackV2 = {
      dataSource: 'slack',
      connectorModes: ['FEDERATED', 'ACTIONS'],
      params: {
        unused_auth_param: 'placeholder',
      },
      actionConfig: {
        isActionConfigured: true,
        actionParams: {
          auth_key: 'ByoOAuth',
        },
      },
    };

    const fields = discoverFields(sourceSlackV2, true);
    const clientIdField = fields.find((f) => f.key === 'client_id');
    const clientSecretField = fields.find((f) => f.key === 'client_secret');
    expect(clientIdField?.location).toBe('actionParams');
    expect(clientSecretField?.location).toBe('actionParams');

    const slackPayload = buildDuplicatePayload({
      sourceConnectorState: sourceSlackV2,
      targetCollectionId: 'slack-v2-clone',
      targetCollectionDisplayName: 'Slack V2 Clone',
      fieldValues: {
        'actionParams.client_id': 'slack-client-456',
        'actionParams.client_secret': 'slack-secret-789',
      },
      includeActions: true,
    });

    expect(slackPayload?.dataConnector.params).toEqual({});
    expect(slackPayload?.dataConnector.actionConfig?.actionParams?.client_id).toBe('slack-client-456');
    expect(slackPayload?.dataConnector.actionConfig?.actionParams?.client_secret).toBe('slack-secret-789');
    expect(slackPayload?.dataConnector.actionConfig?.actionParams?.auth_key).toBe('ByoOAuth');
  });

  it('applies Microsoft schema rules for teams, outlook, onedrive, and slack', () => {
    // 1. Teams discovers instance_uri with default "https://graph.microsoft.com" and preserves instance_uri & tenant_id
    const sourceTeams = {
      dataSource: 'teams',
      connectorModes: ['DATA_INGESTION'],
      params: {
        instance_id: 'teams-tenant-uuid',
      },
    };
    const teamsFields = discoverFields(sourceTeams, false);
    const teamsUriField = teamsFields.find((f) => f.key === 'instance_uri');
    expect(teamsUriField).toBeDefined();
    expect(teamsUriField?.defaultValue).toBe('https://graph.microsoft.com');

    const teamsPayload = buildDuplicatePayload({
      sourceConnectorState: sourceTeams,
      targetCollectionId: 'teams-clone',
      targetCollectionDisplayName: 'Teams Clone',
      fieldValues: {
        'params.instance_uri': 'https://graph.microsoft.com',
        'params.tenant_id': 'teams-tenant-uuid',
        'params.client_id': 'teams-client',
        'params.client_secret': 'teams-secret',
      },
      includeActions: false,
    });
    expect(teamsPayload?.dataConnector.params.instance_uri).toBe('https://graph.microsoft.com');
    expect(teamsPayload?.dataConnector.params.tenant_id).toBe('teams-tenant-uuid');

    // 2. Outlook does not prompt for tenant_id when not on source
    const sourceOutlookNoTenant = {
      dataSource: 'outlook',
      connectorModes: ['DATA_INGESTION'],
      params: {
        client_id: 'outlook-client',
      },
    };
    const outlookFields = discoverFields(sourceOutlookNoTenant, false);
    expect(outlookFields.some((f) => f.key === 'tenant_id')).toBe(false);

    // 3. OneDrive in FEDERATED mode without tenant_id on source does not prompt for tenant_id
    const sourceOneDriveFed = {
      dataSource: 'onedrive',
      connectorModes: ['FEDERATED'],
      params: {
        client_id: 'od-client',
      },
    };
    const oneDriveFedFields = discoverFields(sourceOneDriveFed, false);
    expect(oneDriveFedFields.some((f) => f.key === 'tenant_id')).toBe(false);
  });

  it('blocks legacy 3LO *_federated_search connectors while allowing slack_federated_search with API Token or Google OAuth', () => {
    // 1. Legacy 3LO *_federated_search connectors are blocked
    for (const legacyFed of [
      'box_federated_search',
      'jira_federated_search',
      'confluence_federated_search',
      'github_federated_search',
      'gitlab_federated_search',
      'onedrive_federated_search',
      'outlook_federated_search',
      'sharepoint_federated_search',
      'teams_federated_search',
      'workday_federated_search',
    ]) {
      const eligibility = getConnectorCloneEligibility({
        dataSource: legacyFed,
        connectorType: 'THIRD_PARTY_FEDERATED',
        connectorModes: ['FEDERATED'],
      });
      expect(eligibility.canClone).toBe(false);
      expect(eligibility.reason).toContain('legacy 3LO federated connector');
    }

    // 2. slack_federated_search with API Token is allowed
    const slackFedApiToken = getConnectorCloneEligibility({
      dataSource: 'slack_federated_search',
      connectorType: 'THIRD_PARTY_FEDERATED',
      connectorModes: ['FEDERATED'],
      params: {
        auth_key: 'API Token',
      },
    });
    expect(slackFedApiToken.canClone).toBe(true);

    // 3. slack_federated_search with 3LO OAuth (client_id present) is blocked
    const slackFed3LO = getConnectorCloneEligibility({
      dataSource: 'slack_federated_search',
      connectorType: 'THIRD_PARTY_FEDERATED',
      connectorModes: ['FEDERATED'],
      params: {
        auth_key: 'OAuth',
        client_id: 'slack-client-id',
      },
    });
    expect(slackFed3LO.canClone).toBe(false);
    expect(slackFed3LO.reason).toContain('legacy 3LO federated connector');
  });
});


