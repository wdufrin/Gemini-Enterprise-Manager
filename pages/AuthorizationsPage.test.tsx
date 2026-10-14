import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AuthorizationsPage from './AuthorizationsPage';
import * as api from '../services/apiService';

vi.mock('../services/apiService', () => ({
  listAuthorizations: vi.fn(),
  listResources: vi.fn(),
  getAuthorization: vi.fn(),
  deleteAuthorization: vi.fn(),
  createAuthorization: vi.fn(),
  updateAuthorization: vi.fn(),
}));

describe('AuthorizationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listResources).mockResolvedValue({ collections: [] });
  });

  it('renders plain-English onboarding empty state with serverSideOauth2 explanation and Create CTA when 0 authorizations exist', async () => {
    vi.mocked(api.listAuthorizations).mockResolvedValue({ authorizations: [] });

    render(<AuthorizationsPage projectNumber="12345" projectId="test-proj" />);

    const emptyState = await screen.findByTestId('auth-empty-state');
    expect(emptyState).toBeInTheDocument();
    expect(emptyState).toHaveTextContent('No authorizations found for the provided project number.');
    expect(emptyState).toHaveTextContent('serverSideOauth2');

    const ctaBtn = screen.getByTestId('auth-empty-create-cta');
    fireEvent.click(ctaBtn);

    expect(await screen.findByText(/Create New Authorization/i)).toBeInTheDocument();
  });

  it('deduplicates authorizations across regions and opens ViewAuthModal', async () => {
    const sampleAuth = {
      name: 'projects/12345/locations/global/authorizations/jira-oauth',
      displayName: 'Jira OAuth',
      serverSideOauth2: {
        clientId: 'jira-client-id-999',
        authorizationUri: 'https://auth.atlassian.com/authorize',
        tokenUri: 'https://auth.atlassian.com/oauth/token',
      },
    };

    vi.mocked(api.listAuthorizations).mockResolvedValue({
      authorizations: [sampleAuth],
    });
    vi.mocked(api.getAuthorization).mockResolvedValue(sampleAuth);

    render(<AuthorizationsPage projectNumber="12345" projectId="test-proj" />);

    expect(await screen.findByText('jira-oauth')).toBeInTheDocument();
    expect(screen.getAllByText('jira-client-id-999')).toHaveLength(1);

    // Open ViewAuthModal
    fireEvent.click(screen.getByRole('button', { name: /^View$/i }));
    expect(await screen.findByText(/Configuration Details/i)).toBeInTheDocument();
  });

  it('surfaces regional 403 error in PartialResultsBanner when EU region fails while global succeeds', async () => {
    vi.mocked(api.listAuthorizations).mockImplementation(({ appLocation }: { appLocation: string }) => {
      if (appLocation === 'eu') {
        return Promise.reject(new Error('403 Forbidden: EU location policy blocked'));
      }
      return Promise.resolve({
        authorizations:
          appLocation === 'global'
            ? [
                {
                  name: 'projects/12345/locations/global/authorizations/global-auth',
                  serverSideOauth2: {
                    clientId: 'global-client',
                    authorizationUri: 'https://example.com/auth',
                    tokenUri: 'https://example.com/token',
                  },
                },
              ]
            : [],
      });
    });

    render(<AuthorizationsPage projectNumber="12345" projectId="test-proj" />);

    expect(await screen.findByText('global-auth')).toBeInTheDocument();
    const showDetailsBtn = await screen.findByRole('button', { name: /Show details/i });
    fireEvent.click(showDetailsBtn);

    expect(await screen.findByText(/403 Forbidden: EU location policy blocked/i)).toBeInTheDocument();
  });

  it('renders responsive table-fixed layout with truncated long Client IDs and supports column show/hide toggling', async () => {
    const longClientId = '123456789012-abcdefghijklmnopqrstuvwxyz0123456789.apps.googleusercontent.com';
    const sampleAuth = {
      name: 'projects/12345/locations/global/authorizations/long-google-oauth-authorization-id',
      displayName: 'Google Workspace OAuth',
      serverSideOauth2: {
        clientId: longClientId,
        authorizationUri: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUri: 'https://oauth2.googleapis.com/token',
      },
    };

    vi.mocked(api.listAuthorizations).mockResolvedValue({
      authorizations: [sampleAuth],
    });

    render(<AuthorizationsPage projectNumber="12345" projectId="test-proj" />);

    const authIdEl = await screen.findByText('long-google-oauth-authorization-id');
    expect(authIdEl).toHaveAttribute('title', 'long-google-oauth-authorization-id');

    const table = screen.getByRole('table');
    expect(table.className).toContain('table-fixed');
    expect(table.className).toContain('w-full');

    const clientIdEl = screen.getByText(longClientId);
    expect(clientIdEl).toHaveAttribute('title', longClientId);
    expect(clientIdEl.className).toContain('truncate');

    // Open column picker and hide Client ID column
    fireEvent.click(screen.getByRole('button', { name: /Toggle authorization table columns/i }));
    const clientIdCheckbox = screen.getByLabelText('Client ID');
    expect(clientIdCheckbox).toBeChecked();

    fireEvent.click(clientIdCheckbox);
    expect(screen.queryByText(longClientId)).not.toBeInTheDocument();

    // Re-enable Client ID column
    fireEvent.click(clientIdCheckbox);
    expect(screen.getByText(longClientId)).toBeInTheDocument();
  });
});


