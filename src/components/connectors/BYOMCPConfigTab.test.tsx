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
import BYOMCPConfigTab from '../../../components/connectors/BYOMCPConfigTab';
import * as api from '../../../services/apiService';
import { Config } from '../../../types';

vi.mock('../../../services/apiService', () => ({
  updateDataConnector: vi.fn(),
  listMcpTools: vi.fn(),
}));

const mockConfig: Config = {
  projectId: 'test-project-123',
  appLocation: 'global',
  collectionId: 'default_collection',
  appId: 'test-engine',
  assistantId: 'default_assistant',
};

describe('BYOMCPConfigTab', () => {
  const mockConnector = {
    name: 'projects/test-project-123/locations/global/collections/default_collection/dataConnector',
    dataSource: 'custom_mcp',
    state: 'ACTIVE',
    params: {
      instance_uri: 'https://mcp-server.example.com/mcp',
    },
    actionConfig: {
      createBapConnection: true,
      actionParams: {
        mcp_server_description: 'Test MCP Server description',
        mcp_agent_instructions: 'Original instructions for MCP tools.',
        instance_uri: 'https://mcp-server.example.com/mcp',
        auth_type: 'OAUTH',
        scopes: 'openid email',
        auth_uri: 'https://accounts.google.com/o/oauth2/v2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
      },
    },
    dynamicTools: [
      {
        name: 'search_docs',
        displayName: 'Search Documents',
        description: 'Searches enterprise documents',
        enabled: true,
      },
      {
        name: 'query_db',
        displayName: 'Query Database',
        description: 'Runs read-only SQL queries',
        enabled: false,
      },
    ],
    bapConfig: {
      enabledActions: ['search_docs'],
    },
    refreshInterval: '86400s',
    staticIpEnabled: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders existing BYOMCP fields from connector state', () => {
    render(<BYOMCPConfigTab connector={mockConnector} config={mockConfig} />);

    expect(screen.getByText(/BYOMCP Connector Settings & Configuration/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test MCP Server description')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Original instructions for MCP tools.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://mcp-server.example.com/mcp')).toBeInTheDocument();

    // Check dynamic tools rendering
    expect(screen.getByText('search_docs')).toBeInTheDocument();
    expect(screen.getByText('query_db')).toBeInTheDocument();
    expect(screen.getByText(/Dynamic MCP Tools \(1\/2 enabled\)/i)).toBeInTheDocument();
  });

  it('applies Enterprise Search template preset instructions and description', () => {
    render(<BYOMCPConfigTab connector={mockConnector} config={mockConfig} />);

    const presetBtn = screen.getByRole('button', { name: /Enterprise Search/i });
    fireEvent.click(presetBtn);

    const textarea = screen.getByDisplayValue(/FORMATTING INSTRUCTIONS FOR SEARCH RESULTS/i);
    expect(textarea).toBeInTheDocument();
  });

  it('allows toggling dynamic tools enabled state', () => {
    render(<BYOMCPConfigTab connector={mockConnector} config={mockConfig} />);

    // Toggle query_db from Disabled to Enabled
    const toggleBtns = screen.getAllByRole('button', { name: /Disabled/i });
    expect(toggleBtns.length).toBeGreaterThan(0);
    fireEvent.click(toggleBtns[0]);

    expect(screen.getByText(/Dynamic MCP Tools \(2\/2 enabled\)/i)).toBeInTheDocument();
  });

  it('calls updateDataConnector with proper payload and updateMask when saving', async () => {
    (api.updateDataConnector as any).mockResolvedValueOnce({
      ...mockConnector,
      actionConfig: {
        ...mockConnector.actionConfig,
        actionParams: {
          ...mockConnector.actionConfig.actionParams,
          mcp_server_description: 'Updated Enterprise Search MCP Server',
        },
      },
    });

    const onConnectorUpdated = vi.fn();
    const onRefreshSuccess = vi.fn();

    render(
      <BYOMCPConfigTab
        connector={mockConnector}
        config={mockConfig}
        onConnectorUpdated={onConnectorUpdated}
        onRefreshSuccess={onRefreshSuccess}
      />
    );

    const descInput = screen.getByDisplayValue('Test MCP Server description');
    fireEvent.change(descInput, { target: { value: 'Updated Enterprise Search MCP Server' } });

    const saveBtn = screen.getByRole('button', { name: /Save Settings to Connector/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.updateDataConnector).toHaveBeenCalledWith(
        'projects/test-project-123/locations/global/collections/default_collection/dataConnector',
        expect.objectContaining({
          actionConfig: expect.objectContaining({
            actionParams: expect.objectContaining({
              mcp_server_description: 'Updated Enterprise Search MCP Server',
            }),
          }),
        }),
        expect.arrayContaining(['action_config.action_params']),
        expect.objectContaining({
          projectId: 'test-project-123',
          appLocation: 'global',
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/BYOMCP settings successfully updated in Discovery Engine!/i)).toBeInTheDocument();
      expect(onConnectorUpdated).toHaveBeenCalled();
      expect(onRefreshSuccess).toHaveBeenCalled();
    });
  });

  it('supports Raw JSON editor mode with format and validation', () => {
    render(<BYOMCPConfigTab connector={mockConnector} config={mockConfig} />);

    // Switch to Raw JSON mode
    const jsonModeBtn = screen.getByRole('button', { name: /Raw JSON Editor/i });
    fireEvent.click(jsonModeBtn);

    const textareas = screen.getAllByRole('textbox');
    const textarea = textareas[textareas.length - 1] as HTMLTextAreaElement;
    expect(textarea.value).toContain('mcp_server_description');
    expect(textarea.value).toContain('Test MCP Server description');

    // Test invalid JSON error
    fireEvent.change(textarea, { target: { value: 'invalid json content {' } });
    expect(screen.getByText(/Syntax Error/i)).toBeInTheDocument();

    // Reset
    const resetBtn = screen.getByRole('button', { name: /Reset/i });
    fireEvent.click(resetBtn);
    expect(screen.queryByText(/Syntax Error/i)).not.toBeInTheDocument();
  });

  it('tests connectivity using listMcpTools', async () => {
    (api.listMcpTools as any).mockResolvedValueOnce([
      { name: 'search', description: 'Enterprise search tool' },
      { name: 'get_doc', description: 'Fetch document' },
    ]);

    render(<BYOMCPConfigTab connector={mockConnector} config={mockConfig} />);

    const testBtn = screen.getByRole('button', { name: /Test Connectivity/i });
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(api.listMcpTools).toHaveBeenCalledWith(
        'test-project-123',
        'https://mcp-server.example.com/mcp'
      );
      expect(screen.getByText(/Successfully connected! Server reported 2 available tools/i)).toBeInTheDocument();
    });
  });

  it('copies cURL command to clipboard', () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    render(<BYOMCPConfigTab connector={mockConnector} config={mockConfig} />);

    const copyCurlBtn = screen.getByRole('button', { name: /Copy cURL \(PATCH\)/i });
    fireEvent.click(copyCurlBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('curl -X PATCH')
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('action_config.action_params')
    );
  });
});
