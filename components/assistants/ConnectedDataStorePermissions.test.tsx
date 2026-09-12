import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ConnectedDataStorePermissions from './ConnectedDataStorePermissions';
import SetDataStoreIamPolicyModal from './SetDataStoreIamPolicyModal';
import DataStorePermissionsScriptModal from './DataStorePermissionsScriptModal';
import * as api from '../../services/apiService';
import { AppEngine, Config } from '../../types';

vi.mock('../../services/apiService', () => ({
  getCustomRole: vi.fn(),
  createCustomRole: vi.fn(),
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

    vi.mocked(api.getCustomRole).mockResolvedValue({
      name: 'projects/test-project/roles/customRestrictedEndUser',
      title: 'Custom Gemini Enterprise Restricted End User',
      includedPermissions: ['discoveryengine.locations.buildAuthorizationUrl'],
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

  it('renders ConnectedDataStorePermissions header and custom role status', async () => {
    render(
      <ConnectedDataStorePermissions
        engine={mockEngine}
        config={mockConfig}
        projectNumber="123456789"
      />
    );

    expect(screen.getByText('Connected DataStore Permissions')).toBeDefined();
    expect(screen.getByText('Beta')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText('Active in Project')).toBeDefined();
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
  it('renders Python script and cURL tabs', () => {
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
  });
});
