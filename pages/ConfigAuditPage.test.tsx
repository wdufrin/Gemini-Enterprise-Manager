import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ConfigAuditPage from './ConfigAuditPage';
import * as api from '../services/apiService';

vi.mock('../services/apiService', () => ({
  listResources: vi.fn(),
}));

describe('ConfigAuditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the audit page with Gemini Enterprise App ID dropdown populated from api', async () => {
    vi.mocked(api.listResources).mockImplementation(async (type, config) => {
      if (type === 'engines') {
        return {
          engines: [
            {
              name: 'projects/123456789012/locations/global/collections/default_collection/engines/test-destination_1780931139203',
              displayName: 'test_destination',
              solutionType: 'SOLUTION_TYPE_SEARCH',
            },
            {
              name: 'projects/123456789012/locations/global/collections/default_collection/engines/testing-jira_1766765338880',
              displayName: 'Testing Jira',
              solutionType: 'SOLUTION_TYPE_SEARCH',
            },
          ],
        };
      }
      return {};
    });

    render(
      <ConfigAuditPage
        projectNumber="123456789012"
        projectId="my-project-123456"
        accessToken="mock-token"
      />
    );

    // Verify header exists
    expect(screen.getByText('App Configuration Audit')).toBeInTheDocument();

    // Verify Gemini Enterprise App ID label exists
    const appLabels = screen.getAllByText('Gemini Enterprise App ID');
    expect(appLabels.length).toBeGreaterThanOrEqual(1);

    // Wait for the dropdown to populate with discovered engines
    await waitFor(() => {
      expect(screen.getByText(/test_destination \(test-destination_1780931139203\)/)).toBeInTheDocument();
      expect(screen.getByText(/Testing Jira \(testing-jira_1766765338880\)/)).toBeInTheDocument();
    });

    // Test toggle to enter manually
    const enterManuallyBtn = screen.getByText('Enter manually');
    fireEvent.click(enterManuallyBtn);

    // Now input fields should be shown
    const manualInputs = screen.getAllByPlaceholderText('default_engine');
    expect(manualInputs.length).toBeGreaterThanOrEqual(1);

    // Test toggle back to select from list
    const selectListBtn = screen.getByText('Select from list');
    fireEvent.click(selectListBtn);

    // Dropdown should be back
    expect(screen.getByText(/test_destination \(test-destination_1780931139203\)/)).toBeInTheDocument();
  });
});
