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

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConnectorFiltersTab, { countFilterRules } from '../../../components/connectors/ConnectorFiltersTab';
import * as api from '../../../services/apiService';
import { Config } from '../../../types';

vi.mock('../../../services/apiService', () => ({
  updateDataConnector: vi.fn(),
}));

const mockConfig: Config = {
  projectId: 'test-project',
  appLocation: 'global',
  collectionId: 'default_collection',
  appId: 'test-engine',
  assistantId: 'default_assistant',
};

describe('ConnectorFiltersTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('correctly calculates filter count with countFilterRules helper', () => {
    expect(countFilterRules({})).toBe(0);
    expect(countFilterRules({ Site: ['https://site1.com', 'https://site2.com'], Path: ['/docs'] })).toBe(3);
  });

  it('renders existing inclusion and exclusion filters from connector params', () => {
    const mockConnector = {
      name: 'projects/test-project/locations/global/collections/default_collection/dataConnectors/sharepoint-1',
      dataSource: 'sharepoint',
      params: {
        structured_search_filter: {
          Site: ['https://example.sharepoint.com/sites/engineering'],
        },
        structured_exclusion_search_filter: {
          Path: ['/sites/engineering/archived'],
        },
      },
    };

    render(
      <ConnectorFiltersTab
        connector={mockConnector}
        config={mockConfig}
      />
    );

    // Should show 2 Filter Rules Configured
    expect(screen.getByText(/2 Filter Rules Configured/i)).toBeInTheDocument();
    expect(screen.getByText('https://example.sharepoint.com/sites/engineering')).toBeInTheDocument();

    // Switch to Exclusion tab
    const exclusionTabBtn = screen.getByRole('button', { name: /Exclusion Filters/i });
    fireEvent.click(exclusionTabBtn);

    expect(screen.getByText('/sites/engineering/archived')).toBeInTheDocument();
  });

  it('allows adding new filter category and new values', async () => {
    const mockConnector = {
      name: 'projects/test-project/locations/global/collections/default_collection/dataConnectors/sharepoint-1',
      dataSource: 'sharepoint',
      params: {},
    };

    render(
      <ConnectorFiltersTab
        connector={mockConnector}
        config={mockConfig}
      />
    );

    // Click quick-add "+ Site"
    const quickAddBtns = screen.getAllByRole('button', { name: /\+ Site/i });
    fireEvent.click(quickAddBtns[0]);

    // Check that Site category is rendered
    expect(screen.getByText('Site')).toBeInTheDocument();

    // Add a value to Site
    const input = screen.getByPlaceholderText(/Add Site value/i);
    fireEvent.change(input, { target: { value: 'https://mysite.sharepoint.com' } });

    const addBtn = screen.getByRole('button', { name: /\+ Add/i });
    fireEvent.click(addBtn);

    expect(screen.getByText('https://mysite.sharepoint.com')).toBeInTheDocument();
    expect(screen.getByText(/You have unsaved filter changes/i)).toBeInTheDocument();
  });

  it('calls updateDataConnector API with proper payload when saved', async () => {
    const mockConnector = {
      name: 'projects/test-project/locations/global/collections/default_collection/dataConnectors/sharepoint-1',
      dataSource: 'sharepoint',
      params: {
        structured_search_filter: {
          Site: ['https://example.sharepoint.com/sites/sales'],
        },
      },
    };

    vi.mocked(api.updateDataConnector).mockResolvedValueOnce({
      ...mockConnector,
      params: {
        structured_search_filter: {
          Site: ['https://example.sharepoint.com/sites/sales'],
        },
      },
    });

    const handleUpdateSuccess = vi.fn();
    const handleRefreshSuccess = vi.fn();

    render(
      <ConnectorFiltersTab
        connector={mockConnector}
        config={mockConfig}
        onConnectorUpdated={handleUpdateSuccess}
        onRefreshSuccess={handleRefreshSuccess}
      />
    );

    const saveBtn = screen.getByRole('button', { name: /Save & Apply Filters/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.updateDataConnector).toHaveBeenCalledWith(
        'projects/test-project/locations/global/collections/default_collection/dataConnectors/sharepoint-1',
        expect.objectContaining({
          params: expect.objectContaining({
            structured_search_filter: {
              Site: ['https://example.sharepoint.com/sites/sales'],
            },
          }),
        }),
        expect.arrayContaining(['params']),
        expect.objectContaining({
          projectId: 'test-project',
          appLocation: 'global',
          collectionId: 'default_collection',
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Filters updated successfully in Discovery Engine!/i)).toBeInTheDocument();
      expect(handleUpdateSuccess).toHaveBeenCalled();
      expect(handleRefreshSuccess).toHaveBeenCalled();
    });
  });

  it('supports raw JSON editing mode', () => {
    const mockConnector = {
      name: 'projects/test-project/locations/global/collections/default_collection/dataConnectors/jira-1',
      dataSource: 'jira',
      entities: [
        {
          entityName: 'issue',
          params: {
            inclusion_filters: { Project: ['PROJ'] },
          },
        },
      ],
    };

    render(
      <ConnectorFiltersTab
        connector={mockConnector}
        config={mockConfig}
      />
    );

    // Switch to Raw JSON mode
    const rawJsonBtn = screen.getByRole('button', { name: /Raw JSON/i });
    fireEvent.click(rawJsonBtn);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toContain('inclusion_filters');
    expect(textarea.value).toContain('PROJ');
  });
});
