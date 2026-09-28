import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ConnectedDataStorePermissions from './ConnectedDataStorePermissions';
import SetDataStoreIamPolicyModal from './SetDataStoreIamPolicyModal';
import DataStorePermissionsScriptModal from './DataStorePermissionsScriptModal';
import * as api from '../../services/apiService';
import { AppEngine, Config } from '../../types';
import { REQUIRED_ADMIN_PERMISSIONS } from './datastore-permissions/types';

vi.mock('../../services/apiService', () => ({
  getCustomRole: vi.fn(),
  createCustomRole: vi.fn(),
  updateCustomRole: vi.fn(),
  undeleteCustomRole: vi.fn(),
  testProjectIamPermissions: vi.fn(),
  getDiscoveryProjectConfig: vi.fn(),
  updateDataStoreAccessControlConfig: vi.fn(),
  getProjectIamPolicy: vi.fn(),
  setProjectIamPolicy: vi.fn(),
  getEngineIamPolicy: vi.fn(),
  setEngineIamPolicy: vi.fn(),
  getCollectionIamPolicy: vi.fn(),
  setCollectionIamPolicy: vi.fn(),
  getDataStoreIamPolicy: vi.fn(),
  setDataStoreIamPolicy: vi.fn(),
  listCollections: vi.fn(),
  listResources: vi.fn(),
}));

const mockEngine: AppEngine = {
  name: 'projects/test-project/locations/global/collections/default_collection/engines/Cosmere',
  displayName: 'Cosmere',
  solutionType: 'SOLUTION_TYPE_SEARCH',
  dataStoreIds: ['DataStore1', 'DataConnector3_entityA'],
};

const mockConfig: Config = {
  projectId: 'test-project',
  appLocation: 'global',
  collectionId: 'default_collection',
  appId: 'Cosmere',
  assistantId: 'default_assistant',
};

describe('ConnectedDataStorePermissions Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(api.getDiscoveryProjectConfig).mockResolvedValue({
      name: 'projects/test-project',
      customerProvidedConfig: {
        resourceAccessControlConfig: {
          dataStoreAccessControlEnabled: true,
        },
      },
    });

    vi.mocked(api.testProjectIamPermissions).mockResolvedValue([...REQUIRED_ADMIN_PERMISSIONS]);

    vi.mocked(api.getCustomRole).mockResolvedValue({
      name: 'projects/test-project/roles/customRestrictedEndUser',
      title: 'Custom Gemini Enterprise Restricted End User',
      includedPermissions: [
        'discoveryengine.locations.buildAuthorizationUrl',
        'discoveryengine.devToolsConfigs.get',
      ],
    });

    vi.mocked(api.getProjectIamPolicy).mockResolvedValue({
      etag: 'proj-etag-1',
      bindings: [
        {
          role: 'projects/test-project/roles/customRestrictedEndUser',
          members: ['user:userA@example.com'],
        },
      ],
    });

    vi.mocked(api.getEngineIamPolicy).mockResolvedValue({
      etag: 'eng-etag-1',
      bindings: [
        {
          role: 'roles/discoveryengine.agentspaceUser',
          members: ['user:userA@example.com'],
        },
      ],
    });

    vi.mocked(api.listCollections).mockResolvedValue({
      collections: [
        { name: 'projects/test-project/locations/global/collections/DataConnector3' },
      ],
    });

    vi.mocked(api.listResources).mockResolvedValue({
      dataStores: [
        {
          name: 'projects/test-project/locations/global/collections/default_collection/dataStores/DataStore1',
          displayName: 'DataStore 1',
          industryVertical: 'GENERIC',
          solutionTypes: ['SOLUTION_TYPE_SEARCH'],
          contentConfig: 'CONTENT_REQUIRED',
        },
        {
          name: 'projects/test-project/locations/global/collections/default_collection/dataStores/DataConnector3_entityA',
          displayName: 'DataConnector 3 Entity A',
          industryVertical: 'GENERIC',
          solutionTypes: ['SOLUTION_TYPE_SEARCH'],
          contentConfig: 'CONTENT_REQUIRED',
        },
      ],
    });

    vi.mocked(api.getCollectionIamPolicy).mockResolvedValue({
      etag: 'conn-etag-1',
      bindings: [
        {
          role: 'roles/discoveryengine.agentspaceUser',
          members: ['user:userA@example.com'],
        },
      ],
    });

    vi.mocked(api.getDataStoreIamPolicy).mockResolvedValue({
      etag: 'ds-etag-1',
      bindings: [
        {
          role: 'roles/discoveryengine.agentspaceUser',
          members: ['user:userA@example.com'],
        },
      ],
    });
  });

  it('renders ConnectedDataStorePermissions header, custom role status, and Environment Ready state', async () => {
    render(
      <ConnectedDataStorePermissions
        engine={mockEngine}
        config={mockConfig}
        projectNumber="123456789"
      />
    );

    expect(screen.getByText('Connected DataStore Permissions')).toBeDefined();
    expect(screen.getByText('Environment Readiness & Capability Enablement')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText('Active in Project')).toBeDefined();
      expect(screen.getByText(/Environment Ready for Direct DataStore IAM/)).toBeDefined();
    });
  });

  it('detects disabled project opt-in and outdated custom role missing devToolsConfigs.get, and auto-enables both via 1-click wizard', async () => {
    vi.mocked(api.getDiscoveryProjectConfig).mockResolvedValueOnce({
      name: 'projects/test-project',
      customerProvidedConfig: {
        resourceAccessControlConfig: {
          dataStoreAccessControlEnabled: false,
        },
      },
    });

    // Outdated custom role created prior to Sep 18, 2026 only has buildAuthorizationUrl
    vi.mocked(api.getCustomRole).mockResolvedValue({
      name: 'projects/test-project/roles/customRestrictedEndUser',
      title: 'Custom Gemini Enterprise Restricted End User',
      includedPermissions: ['discoveryengine.locations.buildAuthorizationUrl'],
    });

    vi.mocked(api.updateCustomRole).mockResolvedValueOnce({
      name: 'projects/test-project/roles/customRestrictedEndUser',
      title: 'Custom Gemini Enterprise Restricted End User',
      includedPermissions: [
        'discoveryengine.locations.buildAuthorizationUrl',
        'discoveryengine.devToolsConfigs.get',
      ],
    });

    vi.mocked(api.updateDataStoreAccessControlConfig).mockResolvedValueOnce({
      name: 'projects/test-project',
      customerProvidedConfig: {
        resourceAccessControlConfig: {
          dataStoreAccessControlEnabled: true,
        },
      },
    });

    render(
      <ConnectedDataStorePermissions
        engine={mockEngine}
        config={mockConfig}
        projectNumber="123456789"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Action Required to Enforce DataStore Restrictions/)).toBeDefined();
      expect(screen.getByText('Disabled')).toBeDefined();
      expect(screen.getByText('Needs Permission Upgrade')).toBeDefined();
      expect(screen.getByText('Needs Upgrade')).toBeDefined();
    });

    const autoEnableBtn = screen.getByRole('button', {
      name: /Auto-Enable & Configure Environment/i,
    });
    fireEvent.click(autoEnableBtn);

    await waitFor(() => {
      expect(api.updateCustomRole).toHaveBeenCalledWith(
        'test-project',
        'customRestrictedEndUser',
        expect.objectContaining({
          includedPermissions: expect.arrayContaining([
            'discoveryengine.locations.buildAuthorizationUrl',
            'discoveryengine.devToolsConfigs.get',
          ]),
        })
      );
      expect(api.updateDataStoreAccessControlConfig).toHaveBeenCalledWith(
        'test-project',
        true,
        'global'
      );
    });
  });

  it('flags broad project roles (including agentspaceRestrictedUser) and inconsistent DataConnector entity bindings, and repairs entity sync', async () => {
    vi.mocked(api.getProjectIamPolicy).mockResolvedValue({
      etag: 'proj-etag-broad',
      bindings: [
        {
          role: 'roles/discoveryengine.agentspaceRestrictedUser',
          members: ['user:bypassUser@example.com'],
        },
      ],
    });

    // DataConnector3 has userA@example.com, but child entity DataConnector3_entityA has empty bindings!
    vi.mocked(api.getDataStoreIamPolicy).mockImplementation(async (dsId: string) => {
      if (dsId === 'DataConnector3_entityA') {
        return { etag: 'ent-empty-etag', bindings: [] };
      }
      return {
        etag: 'ds-etag-1',
        bindings: [
          {
            role: 'roles/discoveryengine.agentspaceUser',
            members: ['user:userA@example.com'],
          },
        ],
      };
    });

    vi.mocked(api.setDataStoreIamPolicy).mockResolvedValue({
      etag: 'ent-repaired-etag',
      bindings: [
        {
          role: 'roles/discoveryengine.agentspaceUser',
          members: ['user:userA@example.com'],
        },
      ],
    });

    render(
      <ConnectedDataStorePermissions
        engine={mockEngine}
        config={mockConfig}
        projectNumber="123456789"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/2 Warning\(s\)/)).toBeDefined();
      expect(screen.getByText(/1 Inconsistent/)).toBeDefined();
    });

    const repairBtn = screen.getByRole('button', {
      name: /Repair 1 Connector Sync\(s\)/i,
    });
    fireEvent.click(repairBtn);

    await waitFor(() => {
      expect(api.setDataStoreIamPolicy).toHaveBeenCalledWith(
        'DataConnector3_entityA',
        expect.objectContaining({
          bindings: [
            {
              role: 'roles/discoveryengine.agentspaceUser',
              members: ['user:userA@example.com'],
            },
          ],
        }),
        mockConfig
      );
    });
  });

  it('surfaces 403 permission error when auto-enable fails on project config update without swallowing', async () => {
    vi.mocked(api.getDiscoveryProjectConfig).mockResolvedValueOnce({
      name: 'projects/test-project',
      customerProvidedConfig: {
        resourceAccessControlConfig: {
          dataStoreAccessControlEnabled: false,
        },
      },
    });

    vi.mocked(api.updateDataStoreAccessControlConfig).mockRejectedValueOnce(
      new Error('403 PERMISSION_DENIED: Caller lacks discoveryengine.projects.update')
    );

    render(
      <ConnectedDataStorePermissions
        engine={mockEngine}
        config={mockConfig}
        projectNumber="123456789"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Disabled')).toBeDefined();
    });

    const enableOptInBtn = screen.getByRole('button', {
      name: /Enable Project Opt-In/i,
    });
    fireEvent.click(enableOptInBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/403 PERMISSION_DENIED: Caller lacks discoveryengine\.projects\.update/i)
      ).toBeDefined();
    });
  });

  it('renders discovered connected resources and permissions matrix', async () => {
    render(
      <ConnectedDataStorePermissions
        engine={mockEngine}
        config={mockConfig}
        projectNumber="123456789"
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText('DataConnector3').length).toBeGreaterThan(0);
      expect(screen.getAllByText('DataStore1').length).toBeGreaterThan(0);
      expect(screen.getAllByText('userA@example.com').length).toBeGreaterThan(0);
    });
  });

  it('renders the Active Users & Access Inspector box and handles isolation', async () => {
    render(
      <ConnectedDataStorePermissions
        engine={mockEngine}
        config={mockConfig}
        projectNumber="123456789"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Active Users & Access Inspector')).toBeDefined();
      expect(screen.getAllByText('Configure DataStores ↓').length).toBeGreaterThan(0);
    });
  });

  it('revokes an unchecked connector (both collection and entity) without resetting checkboxes back to all attached connectors after refreshAll or clobbering unattached connectors', async () => {
    const threeConnectorEngine: AppEngine = {
      name: 'projects/test-project/locations/global/collections/default_collection/engines/cosmere',
      displayName: 'Cosmere',
      solutionType: 'SOLUTION_TYPE_SEARCH',
      dataStoreIds: [
        'camp-operations-tools_drive',
        'drive_entity',
        'gcp-people_entity',
      ],
    };

    vi.mocked(api.listCollections).mockResolvedValue({
      collections: [
        { name: 'projects/test-project/locations/global/collections/camp-operations-tools' },
        { name: 'projects/test-project/locations/global/collections/drive' },
        { name: 'projects/test-project/locations/global/collections/gcp-people' },
        { name: 'projects/test-project/locations/global/collections/unlinked-other-app' },
      ],
    });

    vi.mocked(api.listResources).mockResolvedValue({
      dataStores: [
        {
          name: 'projects/test-project/locations/global/collections/default_collection/dataStores/camp-operations-tools_drive',
          displayName: 'Camp Ops Drive',
          industryVertical: 'GENERIC',
          solutionTypes: ['SOLUTION_TYPE_SEARCH'],
          contentConfig: 'CONTENT_REQUIRED',
        },
        {
          name: 'projects/test-project/locations/global/collections/default_collection/dataStores/drive_entity',
          displayName: 'Drive Entity',
          industryVertical: 'GENERIC',
          solutionTypes: ['SOLUTION_TYPE_SEARCH'],
          contentConfig: 'CONTENT_REQUIRED',
        },
        {
          name: 'projects/test-project/locations/global/collections/default_collection/dataStores/gcp-people_entity',
          displayName: 'GCP People Entity',
          industryVertical: 'GENERIC',
          solutionTypes: ['SOLUTION_TYPE_SEARCH'],
          contentConfig: 'CONTENT_REQUIRED',
        },
        {
          name: 'projects/test-project/locations/global/collections/default_collection/dataStores/unlinked-other-app_entity',
          displayName: 'Unlinked Other App Entity',
          industryVertical: 'GENERIC',
          solutionTypes: ['SOLUTION_TYPE_SEARCH'],
          contentConfig: 'CONTENT_REQUIRED',
        },
      ],
    });

    const collectionPolicies: Record<string, { etag: string; bindings: { role: string; members: string[] }[] }> = {
      'camp-operations-tools': {
        etag: 'etag-camp',
        bindings: [{ role: 'roles/discoveryengine.agentspaceUser', members: ['user:wdufrin@google.com'] }],
      },
      drive: {
        etag: 'etag-drive',
        bindings: [{ role: 'roles/discoveryengine.agentspaceUser', members: ['user:wdufrin@google.com'] }],
      },
      'gcp-people': {
        etag: 'etag-people',
        bindings: [{ role: 'roles/discoveryengine.agentspaceUser', members: ['user:wdufrin@google.com'] }],
      },
      'unlinked-other-app': {
        etag: 'etag-unlinked',
        bindings: [{ role: 'roles/discoveryengine.agentspaceUser', members: ['user:wdufrin@google.com'] }],
      },
    };

    const dataStorePolicies: Record<string, { etag: string; bindings: { role: string; members: string[] }[] }> = {
      'camp-operations-tools_drive': {
        etag: 'etag-camp-ent',
        bindings: [{ role: 'roles/discoveryengine.agentspaceUser', members: ['user:wdufrin@google.com'] }],
      },
      drive_entity: {
        etag: 'etag-drive-ent',
        bindings: [{ role: 'roles/discoveryengine.agentspaceUser', members: ['user:wdufrin@google.com'] }],
      },
      'gcp-people_entity': {
        etag: 'etag-people-ent',
        bindings: [{ role: 'roles/discoveryengine.agentspaceUser', members: ['user:wdufrin@google.com'] }],
      },
      'unlinked-other-app_entity': {
        etag: 'etag-unlinked-ent',
        bindings: [{ role: 'roles/discoveryengine.agentspaceUser', members: ['user:wdufrin@google.com'] }],
      },
    };

    vi.mocked(api.getProjectIamPolicy).mockResolvedValue({
      etag: 'proj-etag-1',
      bindings: [
        {
          role: 'projects/test-project/roles/customRestrictedEndUser',
          members: ['user:wdufrin@google.com'],
        },
      ],
    });

    vi.mocked(api.getEngineIamPolicy).mockResolvedValue({
      etag: 'eng-etag-1',
      bindings: [
        {
          role: 'roles/discoveryengine.agentspaceUser',
          members: ['user:wdufrin@google.com'],
        },
      ],
    });

    vi.mocked(api.getCollectionIamPolicy).mockImplementation(async (connId: string) => {
      return JSON.parse(JSON.stringify(collectionPolicies[connId] || { etag: 'e', bindings: [] }));
    });

    vi.mocked(api.setCollectionIamPolicy).mockImplementation(async (connId: string, policy: any) => {
      collectionPolicies[connId] = JSON.parse(JSON.stringify(policy));
      return collectionPolicies[connId];
    });

    vi.mocked(api.getDataStoreIamPolicy).mockImplementation(async (dsId: string) => {
      return JSON.parse(JSON.stringify(dataStorePolicies[dsId] || { etag: 'e', bindings: [] }));
    });

    vi.mocked(api.setDataStoreIamPolicy).mockImplementation(async (dsId: string, policy: any) => {
      dataStorePolicies[dsId] = JSON.parse(JSON.stringify(policy));
      return dataStorePolicies[dsId];
    });

    render(
      <ConnectedDataStorePermissions
        engine={threeConnectorEngine}
        config={mockConfig}
        projectNumber="123456789"
      />
    );

    // Wait for initial load and click Configure DataStores for wdufrin@google.com
    await waitFor(() => {
      expect(screen.getAllByText('Configure DataStores ↓').length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getAllByText('Configure DataStores ↓')[0]);

    // Find the checkbox for 'camp-operations-tools' inside the wizard and uncheck it
    const wizardSection = document.getElementById('wizard-section')!;
    const campConnectorLabel = Array.from(wizardSection.querySelectorAll('label')).find(el =>
      el.textContent?.includes('camp-operations-toolsDataConnector')
    )!;
    const campCheckbox = campConnectorLabel.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(campCheckbox.checked).toBe(true);

    // Uncheck 'camp-operations-tools'
    fireEvent.click(campCheckbox);
    expect(campCheckbox.checked).toBe(false);

    // Submit the wizard ('Apply & Sync Permissions')
    const submitBtn = screen.getByRole('button', { name: /Apply & Sync Permissions/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Successfully synchronized DataStore permissions for 1 member\(s\)!/i)
      ).toBeDefined();
    });

    // Verify 'camp-operations-tools' collection and child entity were revoked
    expect(api.setCollectionIamPolicy).toHaveBeenCalledWith(
      'camp-operations-tools',
      expect.objectContaining({ bindings: [] }),
      mockConfig
    );
    expect(api.setDataStoreIamPolicy).toHaveBeenCalledWith(
      'camp-operations-tools_drive',
      expect.objectContaining({ bindings: [] }),
      mockConfig
    );

    // Verify unlinked project connector was NOT touched/revoked by default
    expect(api.setCollectionIamPolicy).not.toHaveBeenCalledWith(
      'unlinked-other-app',
      expect.anything(),
      expect.anything()
    );

    // Verify project custom role was NOT revoked
    expect(api.setProjectIamPolicy).not.toHaveBeenCalled();

    // Crucial regression check: after post-sync refreshAll() completes, 'camp-operations-tools' must remain unchecked (NOT reset to all attached connectors!)
    expect(campCheckbox.checked).toBe(false);
  });
});

describe('SetDataStoreIamPolicyModal', () => {
  it('allows adding and saving member to IAM policy and propagates connector changes to childEntityIds', async () => {
    const mockOnSuccess = vi.fn();
    vi.mocked(api.setCollectionIamPolicy).mockResolvedValue({
      etag: 'new-coll-etag',
      bindings: [],
    });
    vi.mocked(api.getDataStoreIamPolicy).mockResolvedValue({
      etag: 'ent-etag-1',
      bindings: [
        {
          role: 'roles/discoveryengine.agentspaceUser',
          members: ['user:userA@example.com'],
        },
      ],
    });
    vi.mocked(api.setDataStoreIamPolicy).mockResolvedValue({
      etag: 'ent-etag-2',
      bindings: [],
    });

    render(
      <SetDataStoreIamPolicyModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={mockOnSuccess}
        resourceId="DataConnector3"
        resourceDisplayName="DataConnector 3"
        resourceType="connector"
        resourcePath="projects/test-project/locations/global/collections/DataConnector3"
        config={mockConfig}
        currentPolicy={{
          etag: 'etag-123',
          bindings: [
            {
              role: 'roles/discoveryengine.agentspaceUser',
              members: ['user:userA@example.com'],
            },
          ],
        }}
        childEntityIds={['DataConnector3_entityA']}
      />
    );

    expect(screen.getByText('Edit Resource IAM Policy')).toBeDefined();
    expect(screen.getByText('DataConnector 3')).toBeDefined();
    expect(screen.getByText('user:userA@example.com')).toBeDefined();

    // Remove user:userA@example.com and save
    const removeMemberBtn = screen.getByRole('button', { name: /Remove user:userA@example\.com/i });
    fireEvent.click(removeMemberBtn);

    const saveBtn = screen.getByRole('button', { name: /Save Policy/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.setCollectionIamPolicy).toHaveBeenCalledWith(
        'DataConnector3',
        expect.objectContaining({ bindings: [] }),
        mockConfig
      );
      expect(api.setDataStoreIamPolicy).toHaveBeenCalledWith(
        'DataConnector3_entityA',
        expect.objectContaining({ bindings: [] }),
        mockConfig
      );
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });
});

describe('DataStorePermissionsScriptModal', () => {
  it('renders Python script and cURL tabs with self-service opt-in and v1 endpoints', () => {
    render(
      <DataStorePermissionsScriptModal
        isOpen={true}
        onClose={vi.fn()}
        engine={mockEngine}
        config={mockConfig}
        connectedConnectors={[{ id: 'DataConnector3', entities: ['DataConnector3_entityA'] }]}
        connectedLegacyDataStores={['DataStore1']}
        targetMember="userA@example.com"
      />
    );

    expect(screen.getByText('DataStore ACL Automation Scripts & Commands')).toBeDefined();
    expect(screen.getByText('Python Automation Script')).toBeDefined();
    expect(screen.getByText('REST / cURL Steps')).toBeDefined();

    fireEvent.click(screen.getByText('REST / cURL Steps'));
    expect(screen.getByText(/Step 0 — Enable Self-Service Project Opt-In/)).toBeDefined();
    expect(screen.getByText(/dataStoreAccessControlEnabled/)).toBeDefined();
  });
});


