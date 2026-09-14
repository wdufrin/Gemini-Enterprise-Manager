import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdkToolsConfig } from './AdkToolsConfig';
import { AdkAgentConfig } from '../../services/adkTemplates';
import { ToastProvider } from '../../context/ToastContext';
import { DEFAULT_ADK_CONFIG } from './defaultAdkConfig';

const renderWithToast = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

const baseConfig: AdkAgentConfig = {
  ...DEFAULT_ADK_CONFIG,
  name: 'test_agent',
};

const defaultProps = {
  adkConfig: baseConfig,
  setAdkConfig: vi.fn(),
  handleAdkConfigChange: vi.fn(),
  deployProjectId: 'test-project',
  handleAddCustomMcp: vi.fn(),
  handleUpdateCustomMcp: vi.fn(),
  handleRemoveCustomMcp: vi.fn(),
  handleVerifyCustomMcp: vi.fn(),
  customMcpStatus: {},
  authInputMode: 'select' as const,
  setAuthInputMode: vi.fn(),
  authorizations: [],
};

describe('AdkToolsConfig - Accordion Category Expansion', () => {
  it('initializes oauth and api categories closed when no checkboxes inside are checked', () => {
    renderWithToast(<AdkToolsConfig {...defaultProps} />);

    // OAuth section should be collapsed
    const oauthButton = screen.getByRole('button', { name: /Authentication & User Impersonation/i });
    expect(oauthButton.getAttribute('aria-expanded')).toBe('false');

    // APIs section should be collapsed
    const apisButton = screen.getByRole('button', { name: /Advanced Enterprise GCP APIs/i });
    expect(apisButton.getAttribute('aria-expanded')).toBe('false');
  });

  it('initializes categories as open (unminimized) when active checkboxes are present at mount', () => {
    const activeConfig: AdkAgentConfig = {
      ...baseConfig,
      enableOAuth: true,
      enableCloudLoggingApi: true,
      enableTelemetry: true,
      customMcpEndpoints: [{ name: 'custom', url: 'https://mcp.example.com' }],
    };

    renderWithToast(<AdkToolsConfig {...defaultProps} adkConfig={activeConfig} />);

    const oauthButton = screen.getByRole('button', { name: /Authentication & User Impersonation/i });
    expect(oauthButton.getAttribute('aria-expanded')).toBe('true');

    const apisButton = screen.getByRole('button', { name: /Advanced Enterprise GCP APIs/i });
    expect(apisButton.getAttribute('aria-expanded')).toBe('true');

    const customButton = screen.getByRole('button', { name: /Custom MCP Endpoints/i });
    expect(customButton.getAttribute('aria-expanded')).toBe('true');

    const observabilityButton = screen.getByRole('button', { name: /Observability & Telemetry/i });
    expect(observabilityButton.getAttribute('aria-expanded')).toBe('true');
  });

  it('automatically unhides (expands) OAuth section when a tool with OAuth is selected', () => {
    const { rerender } = renderWithToast(<AdkToolsConfig {...defaultProps} />);

    // Initially collapsed
    const oauthButton = screen.getByRole('button', { name: /Authentication & User Impersonation/i });
    expect(oauthButton.getAttribute('aria-expanded')).toBe('false');

    // User selects BigQuery MCP which sets enableOAuth: true
    rerender(
      <ToastProvider>
        <AdkToolsConfig
          {...defaultProps}
          adkConfig={{
            ...baseConfig,
            enableBigQueryMcp: true,
            enableOAuth: true,
          }}
        />
      </ToastProvider>
    );

    // OAuth section must now be unhidden (aria-expanded is true)
    expect(oauthButton.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Enable End-User OAuth Delegation')).toBeDefined();
  });

  it('automatically unhides (expands) APIs section when an API checkbox becomes checked', () => {
    const { rerender } = renderWithToast(<AdkToolsConfig {...defaultProps} />);

    const apisButton = screen.getByRole('button', { name: /Advanced Enterprise GCP APIs/i });
    expect(apisButton.getAttribute('aria-expanded')).toBe('false');

    rerender(
      <ToastProvider>
        <AdkToolsConfig
          {...defaultProps}
          adkConfig={{
            ...baseConfig,
            enableSecurityCommandCenterApi: true,
            enableOAuth: true,
          }}
        />
      </ToastProvider>
    );

    expect(apisButton.getAttribute('aria-expanded')).toBe('true');
  });

  it('supports manual Expand All and Collapse All', () => {
    renderWithToast(<AdkToolsConfig {...defaultProps} />);

    const expandAllBtn = screen.getByRole('button', { name: /Expand All/i });
    fireEvent.click(expandAllBtn);

    const oauthButton = screen.getByRole('button', { name: /Authentication & User Impersonation/i });
    expect(oauthButton.getAttribute('aria-expanded')).toBe('true');

    const collapseAllBtn = screen.getByRole('button', { name: /Collapse All/i });
    fireEvent.click(collapseAllBtn);

    expect(oauthButton.getAttribute('aria-expanded')).toBe('false');
  });
});
