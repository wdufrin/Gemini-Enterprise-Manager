import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';

// Mock services/apiService completely
vi.mock('../services/apiService', () => ({
  listResources: vi.fn().mockResolvedValue({ collections: [], engines: [], dataStores: [] }),
  listServiceAccounts: vi.fn().mockResolvedValue([]),
  listWorkloadIdentityPools: vi.fn().mockResolvedValue([]),
  listWorkloadIdentityProviders: vi.fn().mockResolvedValue([]),
  getServiceAccountIamPolicy: vi.fn().mockResolvedValue({}),
  getProject: vi.fn().mockResolvedValue({ projectNumber: '123456789' }),
  listCloudRunServices: vi.fn().mockResolvedValue([]),
  listBuckets: vi.fn().mockResolvedValue([]),
  listAuthorizations: vi.fn().mockResolvedValue([]),
  listMcpTools: vi.fn().mockResolvedValue([]),
  listCloudBuilds: vi.fn().mockResolvedValue([]),
  listGcsObjects: vi.fn().mockResolvedValue({ items: [] }),
  listReasoningEngines: vi.fn().mockResolvedValue({ reasoningEngines: [] }),
  listLicenseConfigs: vi.fn().mockResolvedValue({ licenseConfigs: [] }),
  listUserStoreLicenses: vi.fn().mockResolvedValue({ userLicenses: [] }),
  listBillingAccounts: vi.fn().mockResolvedValue({ billingAccounts: [] }),
  listLicenseConfigsUsageStats: vi.fn().mockResolvedValue({ usageStats: [] }),
  listAllReasoningEngines: vi.fn().mockResolvedValue([]),
  listAllReasoningEngineSessions: vi.fn().mockResolvedValue([]),
  onAuthExpired: vi.fn().mockReturnValue(() => {}),
  setDebugLogger: vi.fn(),
}));

// Mock services/gapiService
vi.mock('../services/gapiService', () => {
  const mockGapiClient = {
    cloudresourcemanager: {
      projects: {
        list: vi.fn().mockResolvedValue({ result: { projects: [] } }),
      },
    },
  };
  return {
    initGapiClient: vi.fn().mockResolvedValue(true),
    getGapiClient: vi.fn().mockResolvedValue(mockGapiClient),
  };
});

// Mock window.google accounts API
const mockInitTokenClient = vi.fn();
if (typeof window !== 'undefined') {
  (window as any).google = {
    accounts: {
      oauth2: {
        initTokenClient: mockInitTokenClient,
      },
    },
  };
}

// Mock fetch for config.json
global.fetch = vi.fn().mockImplementation((url: string) => {
  if (url === '/config.json') {
    return Promise.resolve({
      json: () => Promise.resolve({ GOOGLE_CLIENT_ID: 'mock-client-id' }),
    });
  }
  return Promise.reject(new Error('Unknown URL'));
});

// Mock localStorage to ensure it is always present and functional in test environments
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('Gemini Enterprise Manager - App Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('renders welcome screen when no access token is set', async () => {
    render(<App />);

    // Assert welcome screen title and elements
    expect(screen.getByText(/Gemini Enterprise Manager/i)).toBeDefined();
    expect(screen.getByPlaceholderText('Paste GCP Access Token')).toBeDefined();
    expect(screen.getByText('Set Token')).toBeDefined();
  });

  const loginAndSetProject = async () => {
    // 1. Set Token
    const tokenInput = screen.getByPlaceholderText('Paste GCP Access Token');
    fireEvent.change(tokenInput, { target: { value: 'mock-valid-token' } });
    fireEvent.click(screen.getByText('Set Token'));

    // 2. Wait for Step 2 and input Project ID
    await waitFor(() => {
      expect(screen.getByText(/Step 2: Set your Project/i)).toBeDefined();
    });

    const projectInput = screen.getByPlaceholderText('Project ID or Number');
    const setButton = screen.getByRole('button', { name: 'Set' });
    fireEvent.change(projectInput, { target: { value: '123456789' } });
    fireEvent.click(setButton);

    // 3. Click Enter Application
    const enterButton = screen.getByRole('button', { name: 'Enter Application' });
    fireEvent.click(enterButton);
  };

  it('navigates to dashboard after setting a valid access token and project ID', async () => {
    render(<App />);

    await loginAndSetProject();

    // Wait for the app layout to switch to the dashboard
    await waitFor(() => {
      expect(screen.getByText('Gemini Enterprise')).toBeDefined();
    }, { timeout: 5000 });

    // Check that sidebar and default "Agents" page render
    expect(screen.getByText('Gemini Enterprise')).toBeDefined();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Agents/i })).toBeDefined();
    }, { timeout: 5000 });
  });

  it('allows navigating between sidebar tabs in the console', async () => {
    render(<App />);

    await loginAndSetProject();

    await waitFor(() => {
      expect(screen.getByText('Gemini Enterprise')).toBeDefined();
    }, { timeout: 5000 });

    // Locate sidebar and click on "License" tab
    // Note: Tab lists are rendered inside Sidebar component
    const licenseTab = screen.getByRole('button', { name: /^Licenses$/ });
    fireEvent.click(licenseTab);

    // Verify License management page is rendered
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Manage User Licenses/i })).toBeDefined();
    }, { timeout: 5000 });

    // Click on "Backup & Recovery" tab
    const backupTab = screen.getByRole('button', { name: /^Backup & Recovery$/ });
    fireEvent.click(backupTab);

    // Verify Backups management page is rendered
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^Backup & Restore Actions \(GCS\)$/ })).toBeDefined();
    }, { timeout: 5000 });
  });
});
