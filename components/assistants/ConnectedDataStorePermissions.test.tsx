import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ConnectedDataStorePermissions from './ConnectedDataStorePermissions';
import SetDataStoreIamPolicyModal from './SetDataStoreIamPolicyModal';
import DataStorePermissionsScriptModal from './DataStorePermissionsScriptModal';
import * as api from '../../services/apiService';
import { AppEngine, Config } from '../../types';
import {
  CUSTOM_RESTRICTED_ADMIN_PERMISSIONS,
  CUSTOM_RESTRICTED_END_USER_PERMISSIONS,
  REQUIRED_ADMIN_PERMISSIONS,
} from './datastore-permissions/types';

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

const mockCompliantCustomRoles = (_projId: string, roleId: string) =>
  Promise.resolve({
    name: `projects/test-project/roles/${roleId}`,
    title: roleId,
    includedPermissions:
      roleId === 'customRestrictedAdmin'
        ? [...CUSTOM_RESTRICTED_ADMIN_PERMISSIONS]
        : [...CUSTOM_RESTRICTED_END_USER_PERMISSIONS],
  });

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

    vi.mocked(api.getCustomRole).mockImplementation(mockCompliantCustomRoles);

    vi.mocked(api.getProjectIamPolicy).mockResolvedValue({
      etag: 'proj-etag-1',
      bindings: [
        {
          role: 'projects/test-project/roles/customRestrictedEndUser',
          members: ['user:userA@example.com'],
        },
        {
          role: 'roles/discoveryengine.notebookLmUser',
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

  it('renders ConnectedDataStorePermissions header, GA Custom Restricted Roles, locked child entity checkboxes, and Environment Ready state', async () => {
    render(
      <ConnectedDataStorePermissions
        engine={mockEngine}
        config={mockConfig}
        projectNumber="123456789"
      />
    );

    expect(screen.getByText('Connected DataStore Permissions')).toBeDefined();
    expect(screen.getByText('Environment Readiness & Capability Enablement')).toBeDefined();
    expect(screen.getByText('GA Granular Isolation Standard')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText('Custom Restricted Roles')).toBeDefined();
      expect(screen.getAllByText('Resource Access Control').length).toBeGreaterThan(0);
      expect(screen.getByText(/Environment Ready for Direct DataStore IAM/)).toBeDefined();
    });

    // GA rule: Child entity checkbox under DataConnector3 must be disabled (locked to parent connector)
    const entityCheckbox = screen.getByLabelText(
      /Entity DataConnector3_entityA \(synced with DataConnector3\)/i
    ) as HTMLInputElement;
    expect(entityCheckbox.disabled).toBe(true);
  });

  it('detects disabled Resource Access Control + missing GA custom roles and provisions customRestrictedEndUser, customRestrictedAdmin, and project setting via 1-click wizard', async () => {
    vi.mocked(api.getDiscoveryProjectConfig).mockResolvedValueOnce({
      name: 'projects/test-project',
      customerProvidedConfig: {
        resourceAccessControlConfig: {
          dataStoreAccessControlEnabled: false,
        },
      },
    });

    // Initial evaluation + 1-click provisioning probe: custom roles 404 -> created -> re-evaluate succeeds
    let endUserCreated = false;
    let adminCreated = false;
    vi.mocked(api.getCustomRole).mockImplementation(async (_projId: string, roleId: string) => {
      if (roleId === 'customRestrictedEndUser' && !endUserCreated) {
        const err: any = new Error('Not found');
        err.status = 404;
        throw err;
      }
      if (roleId === 'customRestrictedAdmin' && !adminCreated) {
        const err: any = new Error('Not found');
        err.status = 404;
        throw err;
      }
      return mockCompliantCustomRoles(_projId, roleId);
    });

    vi.mocked(api.createCustomRole).mockImplementation(
      async (_projId: string, roleId: string, payload: any) => {
        if (roleId === 'customRestrictedEndUser') endUserCreated = true;
        if (roleId === 'customRestrictedAdmin') adminCreated = true;
        return {
          name: `projects/test-project/roles/${roleId}`,
          title: payload.title,
          includedPermissions: payload.includedPermissions,
        };
      }
    );

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
      expect(screen.getByText('Needs Setup')).toBeDefined();
    });

    const autoEnableBtns = screen.getAllByRole('button', {
      name: /Enable Resource Access Control/i,
    });
    fireEvent.click(autoEnableBtns[0]);

    await waitFor(() => {
      expect(api.createCustomRole).toHaveBeenCalledWith(
        'test-project',
        'customRestrictedEndUser',
        expect.objectContaining({
          stage: 'GA',
          includedPermissions: expect.arrayContaining([
            'discoveryengine.locations.buildAuthorizationUrl',
            'discoveryengine.devToolsConfigs.get',
          ]),
        })
      );
      expect(api.createCustomRole).toHaveBeenCalledWith(
        'test-project',
        'customRestrictedAdmin',
        expect.objectContaining({
          stage: 'GA',
          includedPermissions: expect.arrayContaining(['discoveryengine.engines.list']),
        })
      );
      expect(api.updateDataStoreAccessControlConfig).toHaveBeenCalledWith(
        'test-project',
        true,
        'global'
      );
    });
  });

  it('flags App-Only roles/discoveryengine.agentspaceRestrictedUser & roles/discoveryengine.user as project bypasses and inconsistent DataConnector entity bindings, and repairs entity sync', async () => {
    vi.mocked(api.getProjectIamPolicy).mockResolvedValue({
      etag: 'proj-etag-broad',
      bindings: [
        {
          role: 'roles/discoveryengine.agentspaceRestrictedUser',
          members: ['user:appOnlyBypass@example.com'],
        },
        {
          role: 'roles/discoveryengine.user',
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
      // 2 bypass principals + 1 inconsistent connector = 3 Warning(s)
      expect(screen.getByText(/3 Warning\(s\)/)).toBeDefined();
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

  it('surfaces 403 permission error when enabling Resource Access Control fails on project config update without swallowing', async () => {
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

    const enableBtns = screen.getAllByRole('button', {
      name: /Enable Resource Access Control/i,
    });
    // Click the card-level toggle button (second button)
    fireEvent.click(enableBtns[enableBtns.length - 1]);

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
        {
          role: 'roles/discoveryengine.notebookLmUser',
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

    // Verify project baseline roles were NOT revoked
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
  it('renders Python script and cURL tabs with Resource Access Control enablement, GA customRestrictedEndUser creation, Policy v3, and ETag retry', () => {
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

    fireEvent.click(screen.getByText('Python Automation Script'));
    expect(screen.getByText(/requestedPolicyVersion/)).toBeDefined();
    expect(screen.getByText(/ensure_custom_restricted_end_user_role/)).toBeDefined();

    fireEvent.click(screen.getByText('REST / cURL Steps'));
    expect(screen.getByText(/Step 0 — Enable Resource Access Control in Gemini Enterprise Settings/)).toBeDefined();
    expect(screen.getByText(/dataStoreAccessControlEnabled/)).toBeDefined();
    expect(screen.getByText(/Step A1 — Create & Bind GA Custom Restricted Role at Project Level/)).toBeDefined();
    expect(screen.getByText(/projects\/test-project\/roles\/customRestrictedEndUser/)).toBeDefined();
    expect(screen.getByText(/roles\/discoveryengine\.notebookLmUser/)).toBeDefined();
  });
});

describe('GA Capabilities — Custom Restricted Roles (customRestrictedEndUser/Admin + notebookLmUser + AI Dev Tools) & Resource Roles', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(api.getDiscoveryProjectConfig).mockResolvedValue({
      name: 'projects/test-project',
      customerProvidedConfig: {
        resourceAccessControlConfig: {
          dataStoreAccessControlEnabled: true,
        },
      },
      dataStoreAccessControlEnabled: true,
    } as any);

    vi.mocked(api.testProjectIamPermissions).mockResolvedValue([...REQUIRED_ADMIN_PERMISSIONS]);
    vi.mocked(api.getCustomRole).mockImplementation(mockCompliantCustomRoles);

    vi.mocked(api.getProjectIamPolicy).mockResolvedValue({
      etag: 'proj-etag-1',
      bindings: [
        {
          role: 'roles/discoveryengine.agentspaceRestrictedUser',
          members: ['user:broadUser@example.com'],
        },
        {
          role: 'roles/discoveryengine.user',
          members: ['user:broadUser@example.com'],
        },
      ],
    });

    vi.mocked(api.setProjectIamPolicy).mockImplementation(async (_projId: string, policy: any) => policy);
    vi.mocked(api.getEngineIamPolicy).mockResolvedValue({ etag: 'eng-etag-1', bindings: [] });
    vi.mocked(api.setEngineIamPolicy).mockImplementation(async (_engId: string, policy: any) => policy);
    vi.mocked(api.listCollections).mockResolvedValue({ collections: [] });
    vi.mocked(api.listResources).mockResolvedValue({
      dataStores: [
        {
          name: 'projects/test-project/locations/global/collections/default_collection/dataStores/DataStore1',
          displayName: 'DataStore 1',
          industryVertical: 'GENERIC',
          solutionTypes: ['SOLUTION_TYPE_SEARCH'],
          contentConfig: 'CONTENT_REQUIRED',
        },
      ],
    });
    vi.mocked(api.getDataStoreIamPolicy).mockResolvedValue({ etag: 'ds-etag-1', bindings: [] });
    vi.mocked(api.setDataStoreIamPolicy).mockImplementation(async (_dsId: string, policy: any) => policy);
  });

  it('binds projects/test-project/roles/customRestrictedAdmin + notebookLmUser + optional AI Dev Tools on Project and grants roles/discoveryengine.agentspaceAdmin on Engine & DataStore', async () => {
    const singleDsEngine: AppEngine = {
      ...mockEngine,
      dataStoreIds: ['DataStore1'],
    };

    let currentProjPolicy: any = {
      etag: 'proj-etag-1',
      bindings: [],
    };
    vi.mocked(api.getProjectIamPolicy).mockImplementation(async () =>
      JSON.parse(JSON.stringify(currentProjPolicy))
    );
    vi.mocked(api.setProjectIamPolicy).mockImplementation(async (_projId: string, policy: any) => {
      currentProjPolicy = JSON.parse(JSON.stringify(policy));
      return currentProjPolicy;
    });

    render(
      <ConnectedDataStorePermissions
        engine={singleDsEngine}
        config={mockConfig}
        projectNumber="123456789"
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Resource Role (App & DataStores)')).toBeDefined();
    });

    // Enter principal in wizard
    const memberInput = screen.getByPlaceholderText(/userA@example\.com/i);
    fireEvent.change(memberInput, { target: { value: 'delegatedAdmin@example.com' } });

    const resourceRoleSelect = screen.getByLabelText('Resource Role (App & DataStores)') as HTMLSelectElement;
    fireEvent.change(resourceRoleSelect, { target: { value: 'roles/discoveryengine.agentspaceAdmin' } });
    expect(resourceRoleSelect.value).toBe('roles/discoveryengine.agentspaceAdmin');

    // Also check Step 1c: AI Dev Tools (Optional)
    const aiDevToolsCheckbox = screen
      .getByText('Step 1c: AI Dev Tools (Optional)')
      .closest('label')!
      .querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(aiDevToolsCheckbox);

    // Ensure DataStore1 is checked in the wizard
    const wizardSection = document.getElementById('wizard-section')!;
    const ds1Label = Array.from(wizardSection.querySelectorAll('label')).find(el =>
      el.textContent?.includes('DataStore1')
    )!;
    const ds1Checkbox = ds1Label.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (!ds1Checkbox.checked) {
      fireEvent.click(ds1Checkbox);
    }

    // Submit wizard
    const submitBtn = screen.getByRole('button', { name: /Apply & Sync Permissions/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Successfully synchronized DataStore permissions for 1 member\(s\)!/i)
      ).toBeDefined();
    });

    // Verify project policy accumulated customRestrictedAdmin, notebookLmUser, and AI Dev Tools roles (and NEVER agentspaceRestrictedUser)
    expect(currentProjPolicy.bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'projects/test-project/roles/customRestrictedAdmin',
          members: ['user:delegatedAdmin@example.com'],
        }),
        expect.objectContaining({
          role: 'roles/discoveryengine.notebookLmUser',
          members: ['user:delegatedAdmin@example.com'],
        }),
        expect.objectContaining({
          role: 'roles/cloudaicompanion.user',
          members: ['user:delegatedAdmin@example.com'],
        }),
        expect.objectContaining({
          role: 'roles/businessaicode.user',
          members: ['user:delegatedAdmin@example.com'],
        }),
      ])
    );
    expect(
      currentProjPolicy.bindings.some(
        (b: any) => b.role === 'roles/discoveryengine.agentspaceRestrictedUser'
      )
    ).toBe(false);

    // Verify Engine and DataStore1 received roles/discoveryengine.agentspaceAdmin
    expect(api.setEngineIamPolicy).toHaveBeenCalledWith(
      mockEngine.name,
      expect.objectContaining({
        bindings: expect.arrayContaining([
          expect.objectContaining({
            role: 'roles/discoveryengine.agentspaceAdmin',
            members: ['user:delegatedAdmin@example.com'],
          }),
        ]),
      }),
      mockConfig
    );
    expect(api.setDataStoreIamPolicy).toHaveBeenCalledWith(
      'DataStore1',
      expect.objectContaining({
        bindings: expect.arrayContaining([
          expect.objectContaining({
            role: 'roles/discoveryengine.agentspaceAdmin',
            members: ['user:delegatedAdmin@example.com'],
          }),
        ]),
      }),
      mockConfig
    );
  });

  it('strips both App-Only agentspaceRestrictedUser and roles/discoveryengine.user and grants customRestrictedEndUser + notebookLmUser via IsolateUserModal', async () => {
    const singleDsEngine: AppEngine = {
      ...mockEngine,
      dataStoreIds: ['DataStore1'],
    };

    render(
      <ConnectedDataStorePermissions
        engine={singleDsEngine}
        config={mockConfig}
        projectNumber="123456789"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('⚡ Isolate')).toBeDefined();
    });

    fireEvent.click(screen.getByText('⚡ Isolate'));

    const confirmBtn = await screen.findByRole('button', { name: /Confirm & Isolate User\(s\)/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.setProjectIamPolicy).toHaveBeenCalledWith(
        'test-project',
        expect.objectContaining({
          bindings: [
            {
              role: 'projects/test-project/roles/customRestrictedEndUser',
              members: ['user:broadUser@example.com'],
            },
            {
              role: 'roles/discoveryengine.notebookLmUser',
              members: ['user:broadUser@example.com'],
            },
          ],
        })
      );
    });
  });

  it('surfaces API error and does not call onSuccess when SetDataStoreIamPolicyModal save fails', async () => {
    const mockOnSuccess = vi.fn();
    vi.mocked(api.setCollectionIamPolicy).mockRejectedValueOnce(
      new Error('403 Forbidden: Missing discoveryengine.collections.setIamPolicy permission')
    );

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
        currentPolicy={{ etag: 'etag-123', bindings: [] }}
      />
    );

    // Add a role binding first, then use quick-set button for Set agentspaceViewer
    fireEvent.click(screen.getByRole('button', { name: /Add New Role Binding/i }));
    fireEvent.click(screen.getByRole('button', { name: /Set agentspaceViewer/i }));
    fireEvent.change(screen.getByPlaceholderText(/Add member/i), {
      target: { value: 'viewer@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add Member/i }));
    fireEvent.click(screen.getByRole('button', { name: /Save Policy/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/403 Forbidden: Missing discoveryengine\.collections\.setIamPolicy permission/i)
      ).toBeDefined();
    });
    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it('grants organization-wide principals (domain: and workforcePools/*) and warns when allUsers is entered in SetDataStoreIamPolicyModal', async () => {
    const mockOnSuccess = vi.fn();
    vi.mocked(api.setDataStoreIamPolicy).mockResolvedValueOnce({
      etag: 'etag-updated',
      bindings: [
        {
          role: 'roles/discoveryengine.agentspaceUser',
          members: [
            'domain:example.com',
            'principalSet://iam.googleapis.com/locations/global/workforcePools/POOL_ID/*',
          ],
        },
      ],
    });

    render(
      <SetDataStoreIamPolicyModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={mockOnSuccess}
        resourceId="DataStore1"
        resourceDisplayName="DataStore 1"
        resourceType="datastore"
        resourcePath="projects/test-project/locations/global/collections/default_collection/dataStores/DataStore1"
        config={mockConfig}
        currentPolicy={{ etag: 'etag-123', bindings: [] }}
      />
    );

    // Click the header '+ Grant Entire Domain (domain:...)' and '+ Grant All Workforce Pool Users (/*)' buttons
    fireEvent.click(screen.getByRole('button', { name: /\+ Grant Entire Domain/i }));
    fireEvent.click(screen.getByRole('button', { name: /\+ Grant All Workforce Pool Users/i }));

    // Typing 'allUsers' should normalize to 'allUsers' (not 'user:allUsers') and surface the ONLY_SPECIFIC_MEMBERS warning
    fireEvent.change(screen.getByPlaceholderText(/Add member/i), {
      target: { value: 'allUsers' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add Member/i }));

    expect(
      screen.getByText(/Member allUsers is invalid due to membership type restrictions on the resource/i)
    ).toBeDefined();

    // Remove allUsers before saving
    fireEvent.click(screen.getByRole('button', { name: /Remove allUsers/i }));

    fireEvent.click(screen.getByRole('button', { name: /Save Policy/i }));

    await waitFor(() => {
      expect(api.setDataStoreIamPolicy).toHaveBeenCalledWith(
        'DataStore1',
        {
          etag: 'etag-123',
          bindings: [
            {
              role: 'roles/discoveryengine.agentspaceUser',
              members: [
                'domain:example.com',
                'principalSet://iam.googleapis.com/locations/global/workforcePools/POOL_ID/*',
              ],
            },
          ],
        },
        mockConfig
      );
    });
    expect(mockOnSuccess).toHaveBeenCalled();
  });

  it('displays ONLY_SPECIFIC_MEMBERS warning when allUsers is entered in AccessGrantWizard and supports organization-wide domain:example.com sync', async () => {
    const singleDsEngine: AppEngine = {
      ...mockEngine,
      dataStoreIds: ['DataStore1'],
    };

    render(
      <ConnectedDataStorePermissions
        engine={singleDsEngine}
        config={mockConfig}
        projectNumber="123456789"
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /\+ domain:example\.com/i })).toBeDefined();
    });

    // Entering allUsers shows the ONLY_SPECIFIC_MEMBERS restriction alert
    const memberInput = screen.getByPlaceholderText(/userA@example\.com/i);
    fireEvent.change(memberInput, { target: { value: 'allUsers' } });
    expect(screen.getByText(/Cloud IAM Restriction on DataStores:/i)).toBeDefined();

    // Clear and click '+ domain:example.com'
    fireEvent.change(memberInput, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /\+ domain:example\.com/i }));

    // Ensure DataStore1 is checked in the wizard
    const wizardSection = document.getElementById('wizard-section')!;
    const ds1Label = Array.from(wizardSection.querySelectorAll('label')).find(el =>
      el.textContent?.includes('DataStore1')
    )!;
    const ds1Checkbox = ds1Label.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (!ds1Checkbox.checked) {
      fireEvent.click(ds1Checkbox);
    }

    fireEvent.click(screen.getByRole('button', { name: /Apply & Sync Permissions/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Successfully synchronized DataStore permissions for 1 member\(s\)!/i)
      ).toBeDefined();
    });

    expect(api.setEngineIamPolicy).toHaveBeenCalledWith(
      mockEngine.name,
      expect.objectContaining({
        bindings: expect.arrayContaining([
          expect.objectContaining({
            role: 'roles/discoveryengine.agentspaceUser',
            members: ['domain:example.com'],
          }),
        ]),
      }),
      mockConfig
    );
    expect(api.setDataStoreIamPolicy).toHaveBeenCalledWith(
      'DataStore1',
      expect.objectContaining({
        bindings: expect.arrayContaining([
          expect.objectContaining({
            role: 'roles/discoveryengine.agentspaceUser',
            members: ['domain:example.com'],
          }),
        ]),
      }),
      mockConfig
    );
  });
});




