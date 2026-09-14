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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServiceCheck } from './McpServiceCheck';
import * as api from '../services/apiService';
import { ToastProvider } from '../context/ToastContext';

vi.mock('../services/apiService', () => ({
  checkServiceEnabled: vi.fn(),
  enableService: vi.fn(),
  listMcpTools: vi.fn(),
  checkMcpCompliance: vi.fn(),
}));

const checkMcpCompliance = vi.mocked(api.checkMcpCompliance);
const listMcpTools = vi.mocked(api.listMcpTools);

const renderCheck = (props: Partial<React.ComponentProps<typeof McpServiceCheck>> = {}) =>
  render(
    <ToastProvider>
      <McpServiceCheck
        projectId="test-project"
        serviceName="bigquery.googleapis.com"
        mcpEndpoint="https://bigquery.googleapis.com/mcp"
        label="BigQuery"
        checked={true}
        onChange={() => {}}
        {...props}
      />
    </ToastProvider>,
  );

/**
 * Regression suite for the "Ready (0 tools)" ghost success.
 *
 * `listMcpTools` was invoked as a fire-and-forget promise whose rejection was
 * routed to `console.warn`. Because the badge rendered
 * `Ready ({tools.length} tools)` unconditionally once the API was enabled, a
 * total transport failure -- the CORS regression, an expired token, a 403 --
 * was pixel-identical to a healthy service that exposes no tools. The operator
 * saw green.
 *
 * These tests fail against that implementation.
 */
describe('McpServiceCheck tool discovery failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Silence the deliberate console.error from the failure path.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not report a green "Ready" badge when tool discovery fails', async () => {
    checkMcpCompliance.mockResolvedValue(true);
    listMcpTools.mockRejectedValue(new Error('Failed to fetch'));

    renderCheck();

    await waitFor(() => {
      expect(screen.getByText('Tools unavailable')).toBeInTheDocument();
    });

    // The precise string the old build showed for a total failure.
    expect(screen.queryByText('Ready (0 tools)')).not.toBeInTheDocument();
    expect(screen.queryByText(/Ready \(/)).not.toBeInTheDocument();
  });

  it('surfaces the underlying error text, not a generic message', async () => {
    checkMcpCompliance.mockResolvedValue(true);
    listMcpTools.mockRejectedValue(
      new Error('MCP endpoint https://bigquery.googleapis.com/mcp returned HTTP 403'),
    );

    renderCheck();

    await waitFor(() => {
      expect(screen.getByText('Tools unavailable')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Tools unavailable'));

    expect(screen.getByText('Tool discovery failed')).toBeInTheDocument();
    expect(screen.getByText(/returned HTTP 403/)).toBeInTheDocument();
  });

  it('offers a Retry that actually re-invokes discovery and can recover', async () => {
    checkMcpCompliance.mockResolvedValue(true);
    listMcpTools.mockRejectedValueOnce(new Error('Failed to fetch'));

    renderCheck();

    await waitFor(() => {
      expect(screen.getByText('Tools unavailable')).toBeInTheDocument();
    });
    expect(listMcpTools).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Tools unavailable'));

    // The retry must perform real work, not merely clear the error state.
    listMcpTools.mockResolvedValueOnce([{ name: 'list_dataset_ids' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(screen.getByText('Ready (1 tools)')).toBeInTheDocument();
    });
    expect(listMcpTools).toHaveBeenCalledTimes(2);
  });

  it('distinguishes a genuinely empty tool list from a failure', async () => {
    checkMcpCompliance.mockResolvedValue(true);
    listMcpTools.mockResolvedValue([]);

    renderCheck();

    await waitFor(() => {
      expect(screen.getByText('Ready (0 tools)')).toBeInTheDocument();
    });
    expect(screen.queryByText('Tools unavailable')).not.toBeInTheDocument();
  });

  it('reports the real tool count on success', async () => {
    checkMcpCompliance.mockResolvedValue(true);
    listMcpTools.mockResolvedValue([
      { name: 'list_dataset_ids' },
      { name: 'execute_sql' },
    ]);

    renderCheck();

    await waitFor(() => {
      expect(screen.getByText('Ready (2 tools)')).toBeInTheDocument();
    });
  });

  it('does not claim readiness while discovery is still in flight', async () => {
    checkMcpCompliance.mockResolvedValue(true);
    let resolveTools: (v: Record<string, unknown>[]) => void = () => {};
    listMcpTools.mockReturnValue(
      new Promise((resolve) => {
        resolveTools = resolve;
      }),
    );

    renderCheck();

    await waitFor(() => {
      expect(screen.getByText('Loading tools…')).toBeInTheDocument();
    });
    expect(screen.queryByText('Ready (0 tools)')).not.toBeInTheDocument();

    resolveTools([{ name: 'execute_sql' }]);
    await waitFor(() => {
      expect(screen.getByText('Ready (1 tools)')).toBeInTheDocument();
    });
  });

  it('ignores a stale response that lands after the project changed', async () => {
    checkMcpCompliance.mockResolvedValue(true);

    let resolveStale: (v: Record<string, unknown>[]) => void = () => {};
    listMcpTools.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStale = resolve;
      }),
    );

    const { rerender } = renderCheck({ projectId: 'project-a' });
    await waitFor(() => expect(listMcpTools).toHaveBeenCalledTimes(1));

    // Switch projects while the first request is still outstanding.
    listMcpTools.mockResolvedValueOnce([{ name: 'from_project_b' }]);
    rerender(
      <ToastProvider>
        <McpServiceCheck
          projectId="project-b"
          serviceName="bigquery.googleapis.com"
          mcpEndpoint="https://bigquery.googleapis.com/mcp"
          label="BigQuery"
          checked={true}
          onChange={() => {}}
        />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Ready (1 tools)')).toBeInTheDocument();
    });

    // Project A's response arrives late with a different payload.
    resolveStale([
      { name: 'from_project_a_1' },
      { name: 'from_project_a_2' },
      { name: 'from_project_a_3' },
    ]);

    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText('Ready (1 tools)')).toBeInTheDocument();
    expect(screen.queryByText('Ready (3 tools)')).not.toBeInTheDocument();
  });
});
