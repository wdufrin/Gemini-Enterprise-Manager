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
});

describe('SetDataStoreIamPolicyModal', () => {
  it('allows adding and saving member to IAM policy', async () => {
    const mockOnSuccess = vi.fn();
    vi.mocked(api.setDataStoreIamPolicy).mockResolvedValue({
      etag: 'new-etag',
      bindings: [],
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
        currentPolicy={{
          etag: 'etag-123',
          bindings: [
            {
              role: 'roles/discoveryengine.agentspaceUser',
              members: ['user:userA@example.com'],
            },
          ],
        }}
      />
    );

    expect(screen.getByText('Edit Resource IAM Policy')).toBeDefined();
    expect(screen.getByText('DataStore 1')).toBeDefined();
    expect(screen.getByText('user:userA@example.com')).toBeDefined();
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

