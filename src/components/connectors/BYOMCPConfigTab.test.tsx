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
import {
  validateJsonPointer,
  evaluateJsonPointer,
  validateCitationMappings,
  validateRawCitationMappingsObject,
  previewCitationExtraction,
  parseCitationMappingsFromApi,
  serializeCitationMappingsToApi,
} from '../../../components/connectors/byomcp/citationPointerUtils';
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
    vi.mocked(api.updateDataConnector).mockResolvedValueOnce({
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
              instance_uri: 'https://mcp-server.example.com/mcp',
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
    vi.mocked(api.listMcpTools).mockResolvedValueOnce([
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

  it('renders existing citation_mappings, previews citation chips live, and saves updated mappings', async () => {
    const connectorWithCitations = {
      ...mockConnector,
      actionConfig: {
        ...mockConnector.actionConfig,
        actionParams: {
          ...mockConnector.actionConfig.actionParams,
          citation_mappings: {
            '': {
              items: '/results',
              uri: '/link',
              title: '/name',
            },
            search_docs: {
              snippet: '/summary',
              id: '/doc_id',
            },
          },
        },
      },
    };

    vi.mocked(api.updateDataConnector).mockResolvedValueOnce(connectorWithCitations);

    render(<BYOMCPConfigTab connector={connectorWithCitations} config={mockConfig} />);

    // Verify existing rules are rendered and NOT leaked into Custom Action Parameters
    expect(screen.getByText(/"" \(Default Entry\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Tool name for rule 2')).toHaveValue('search_docs');
    expect(screen.getByText(/Custom Action Parameters \(0\)/i)).toBeInTheDocument();

    // Verify Live Citation Previewer renders simulated citation chips from the sample response
    expect(screen.getByText('Global Expense Policy 2026')).toBeInTheDocument();
    expect(screen.getByText('https://intranet.cymbal.com/kb/1042')).toBeInTheDocument();
    expect(screen.getByText('id: kb-1042')).toBeInTheDocument();

    // Clear all mappings and verify saving sends citation_mappings: {}
    const clearBtn = screen.getByRole('button', { name: /Clear All/i });
    fireEvent.click(clearBtn);

    const saveBtn = screen.getByRole('button', { name: /Save Settings to Connector/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.updateDataConnector).toHaveBeenCalledWith(
        connectorWithCitations.name,
        expect.objectContaining({
          actionConfig: expect.objectContaining({
            actionParams: expect.objectContaining({
              citation_mappings: {},
            }),
          }),
        }),
        expect.arrayContaining(['action_config.action_params']),
        expect.anything()
      );
    });
  });

  it('blocks saving when citation_mappings contains an invalid RFC 6901 JSON Pointer', async () => {
    render(<BYOMCPConfigTab connector={mockConnector} config={mockConfig} />);

    // Add default ("") rule
    const addDefaultBtn = screen.getByRole('button', { name: /Add Default \(""\) Rule/i });
    fireEvent.click(addDefaultBtn);

    // Enter a malformed pointer without a leading slash
    const uriInput = screen.getByLabelText('uri pointer for default');
    fireEvent.change(uriInput, { target: { value: 'invalid_pointer_without_slash' } });

    expect(
      screen.getByText(/Is not a valid RFC 6901 JSON Pointer: nonempty pointers must start with "\/"/i)
    ).toBeInTheDocument();

    const saveBtn = screen.getByRole('button', { name: /Save Settings to Connector/i });
    fireEvent.click(saveBtn);

    expect(api.updateDataConnector).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Invalid citation_mappings configuration/i)
    ).toBeInTheDocument();
  });

  it('supports section focus filter pills, per-tool + Citations quick action, and collapses Live Preview when no mappings exist', () => {
    render(<BYOMCPConfigTab connector={mockConnector} config={mockConfig} />);

    // Live Citation Preview should be collapsed by default when no citation_mappings exist
    expect(screen.queryByText(/Sample MCP Tool Response JSON/i)).not.toBeInTheDocument();

    // Click "+ Citations" on the first discovered tool (search_docs)
    const addCitationsBtns = screen.getAllByRole('button', { name: /\+ Citations/i });
    expect(addCitationsBtns.length).toBe(2);
    fireEvent.click(addCitationsBtns[0]);

    // Verify search_docs now shows "Custom Citations" badge and its rule is added
    expect(screen.getByText('Custom Citations')).toBeInTheDocument();
    expect(screen.getByLabelText('Tool name for rule 1')).toHaveValue('search_docs');

    // Filter to "Endpoint, Tools & Citations" section only
    const toolsFilterBtn = screen.getByRole('button', {
      name: /Endpoint, Tools & Citations/i,
    });
    fireEvent.click(toolsFilterBtn);
    expect(screen.queryByDisplayValue('Test MCP Server description')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('https://mcp-server.example.com/mcp')).toBeInTheDocument();

    // Return to "All Sections"
    fireEvent.click(screen.getByRole('button', { name: /All Sections/i }));
    expect(screen.getByDisplayValue('Test MCP Server description')).toBeInTheDocument();
  });
});

describe('citationPointerUtils (RFC 6901 & citation_mappings validation and evaluation)', () => {
  it('validates valid and hostile RFC 6901 JSON pointers', () => {
    expect(validateJsonPointer('')).toEqual({ valid: true });
    expect(validateJsonPointer('/results')).toEqual({ valid: true });
    expect(validateJsonPointer('/links/0/href')).toEqual({ valid: true });
    expect(validateJsonPointer('/a~1b/c~0d')).toEqual({ valid: true });

    // Negative / adversarial inputs
    expect(validateJsonPointer('results').valid).toBe(false);
    expect(validateJsonPointer('/bad~escape').valid).toBe(false);
    expect(validateJsonPointer('/trailing~').valid).toBe(false);
    expect(validateJsonPointer('/' + 'a'.repeat(513)).valid).toBe(false);
  });

  it('evaluates RFC 6901 JSON pointers including escaped keys and array indices', () => {
    const doc = {
      results: [
        {
          'a/b': 'slash-value',
          'c~d': 'tilde-value',
          links: [{ href: 'https://example.com/doc/1' }],
        },
      ],
    };

    expect(evaluateJsonPointer(doc, '')).toEqual({ found: true, value: doc });
    expect(evaluateJsonPointer(doc, '/results/0/a~1b')).toEqual({
      found: true,
      value: 'slash-value',
    });
    expect(evaluateJsonPointer(doc, '/results/0/c~0d')).toEqual({
      found: true,
      value: 'tilde-value',
    });
    expect(evaluateJsonPointer(doc, '/results/0/links/0/href')).toEqual({
      found: true,
      value: 'https://example.com/doc/1',
    });

    // Negative lookups
    expect(evaluateJsonPointer(doc, '/results/01/links').found).toBe(false);
    expect(evaluateJsonPointer(doc, '/results/99/links').found).toBe(false);
    expect(evaluateJsonPointer(doc, 'missing_leading_slash').found).toBe(false);
  });

  it('rejects malformed citation_mappings rules and raw objects', () => {
    // Missing uri when no default rule provides uri
    const missingUriIssues = validateCitationMappings([
      {
        toolName: 'search_docs',
        items: '/results',
        uri: '',
        title: '/name',
        snippet: '',
        id: '',
      },
    ]);
    expect(missingUriIssues.some((i) => i.severity === 'error' && i.role === 'uri')).toBe(true);

    // Default entry ("") is exempt from uri when named tools provide their own uri
    const validExemptDefault = validateCitationMappings([
      {
        toolName: '',
        items: '/results',
        uri: '',
        title: '/name',
        snippet: '',
        id: '',
      },
      {
        toolName: 'search_docs',
        items: '',
        uri: '/link',
        title: '',
        snippet: '',
        id: '',
      },
    ]);
    expect(validExemptDefault.filter((i) => i.severity === 'error')).toHaveLength(0);

    // Over 101 entries rejected
    const oversizedRules = Array.from({ length: 102 }, (_, idx) => ({
      toolName: `tool_${idx}`,
      items: '/results',
      uri: '/link',
      title: '/title',
      snippet: '',
      id: '',
    }));
    expect(
      validateCitationMappings(oversizedRules).some((i) =>
        i.message.includes('more than the supported maximum of 101')
      )
    ).toBe(true);

    // Raw object validation for unknown role and non-string pointer
    const rawIssues = validateRawCitationMappingsObject({
      search_docs: {
        titel: '/name',
        uri: 12345,
      },
    });
    expect(rawIssues.some((i) => i.message.includes('unknown citation role "titel"'))).toBe(true);
    expect(rawIssues.some((i) => i.message.includes('must be a string JSON Pointer'))).toBe(true);
  });

  it('handles MCP content[0].text wrapper, structuredContent.result, and unstructured text fallback in previewCitationExtraction', () => {
    const rules = parseCitationMappingsFromApi({
      '': {
        items: '/results',
        uri: '/link',
        title: '/name',
      },
      get_doc: {
        items: '',
      },
    });

    // Verify serialization preserves explicit empty string items: ""
    const serialized = serializeCitationMappingsToApi(rules);
    expect(serialized.get_doc).toEqual({ items: '' });

    // 1. MCP content[0].text serialized JSON wrapper
    const wrappedPayload = JSON.stringify({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            results: [{ link: 'https://cymbal.com/1', name: 'Doc 1', summary: 'Auto snippet' }],
          }),
        },
      ],
    });
    const res1 = previewCitationExtraction(wrappedPayload, 'search_docs', rules);
    expect(res1.wrapperType).toBe('mcp_text_json');
    expect(res1.chips).toHaveLength(1);
    expect(res1.chips[0].uri).toBe('https://cymbal.com/1');
    expect(res1.chips[0].title).toBe('Doc 1');
    expect(res1.chips[0].snippet).toBe('Auto snippet');

    // 2. Single-object structuredContent.result with items: ""
    const structuredSinglePayload = JSON.stringify({
      structuredContent: {
        result: {
          link: 'https://cymbal.com/single',
          name: 'Single Doc',
        },
      },
    });
    const res2 = previewCitationExtraction(structuredSinglePayload, 'get_doc', rules);
    expect(res2.itemsFound).toBe(true);
    expect(res2.chips).toHaveLength(1);
    expect(res2.chips[0].uri).toBe('https://cymbal.com/single');

    // 3. Unstructured plain text inside content[0].text triggers fallback
    const plainTextWrapper = JSON.stringify({
      content: [{ type: 'text', text: '# Plain markdown response, not JSON' }],
    });
    const res3 = previewCitationExtraction(plainTextWrapper, 'search_docs', rules);
    expect(res3.wrapperType).toBe('mcp_unstructured_text');
    expect(res3.fallbackTriggered).toBe(true);
  });
});

