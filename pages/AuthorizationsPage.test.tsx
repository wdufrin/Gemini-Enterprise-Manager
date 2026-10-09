import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
    (api.listResources as any).mockResolvedValue({ collections: [] });
  });

  it('renders plain-English onboarding empty state with serverSideOauth2 explanation and Create CTA when 0 authorizations exist', async () => {
    (api.listAuthorizations as any).mockResolvedValue({ authorizations: [] });

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

    (api.listAuthorizations as any).mockResolvedValue({
      authorizations: [sampleAuth],
    });
    (api.getAuthorization as any).mockResolvedValue(sampleAuth);

    render(<AuthorizationsPage projectNumber="12345" projectId="test-proj" />);

    expect(await screen.findByText('jira-oauth')).toBeInTheDocument();
    expect(screen.getAllByText('jira-client-id-999')).toHaveLength(1);

    // Open ViewAuthModal
    fireEvent.click(screen.getByRole('button', { name: /^View$/i }));
    expect(await screen.findByText(/Configuration Details/i)).toBeInTheDocument();
  });

  it('surfaces regional 403 error in PartialResultsBanner when EU region fails while global succeeds', async () => {
    (api.listAuthorizations as any).mockImplementation(({ appLocation }: { appLocation: string }) => {
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
});
