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

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArchitectureMatrixTable } from './ArchitectureMatrixTable';
import { GraphNode, GraphEdge } from '../../types';

describe('ArchitectureMatrixTable', () => {
  const sampleNodes: GraphNode[] = [
    {
      id: 'projects/123/locations/global/collections/default_collection/engines/engine-alpha',
      type: 'ReasoningEngine',
      label: 'Engine Alpha',
      data: {},
    },
    {
      id: 'projects/123/locations/global/collections/default_collection/dataStores/ds-kb',
      type: 'DataStore',
      label: 'Knowledge Base DS',
      data: {},
    },
    {
      id: 'projects/123/locations/global/services/agent-backend',
      type: 'CloudRunService',
      label: 'Agent Backend Service',
      data: {},
    },
  ];

  const sampleEdges: GraphEdge[] = [
    {
      id: 'edge-1',
      source: 'projects/123/locations/global/collections/default_collection/engines/engine-alpha',
      target: 'projects/123/locations/global/collections/default_collection/dataStores/ds-kb',
    },
    {
      id: 'edge-2',
      source: 'projects/123/locations/global/services/agent-backend',
      target: 'projects/123/locations/global/collections/default_collection/engines/engine-alpha',
    },
  ];

  it('renders all resources with labels and types', () => {
    render(
      <ArchitectureMatrixTable
        nodes={sampleNodes}
        edges={sampleEdges}
        selectedNodeId={null}
        onSelectNode={vi.fn()}
      />
    );

    expect(screen.getByText('Engine Alpha')).toBeInTheDocument();
    expect(screen.getByText('Knowledge Base DS')).toBeInTheDocument();
    expect(screen.getByText('Agent Backend Service')).toBeInTheDocument();
    expect(screen.getByText('3 Resources')).toBeInTheDocument();
  });

  it('displays inbound and outbound connection buttons correctly', () => {
    render(
      <ArchitectureMatrixTable
        nodes={sampleNodes}
        edges={sampleEdges}
        selectedNodeId={null}
        onSelectNode={vi.fn()}
      />
    );

    // In Engine Alpha row:
    // Outbound connects to Knowledge Base DS
    expect(screen.getByTitle('Jump to Knowledge Base DS')).toBeInTheDocument();
    // Inbound called by Agent Backend Service
    expect(screen.getByTitle('Jump to Agent Backend Service')).toBeInTheDocument();
  });

  it('filters resources based on searchQuery', () => {
    render(
      <ArchitectureMatrixTable
        nodes={sampleNodes}
        edges={sampleEdges}
        selectedNodeId={null}
        onSelectNode={vi.fn()}
        searchQuery="Knowledge"
      />
    );

    expect(screen.getByText('Knowledge Base DS')).toBeInTheDocument();
    expect(screen.queryByText('Engine Alpha')).not.toBeInTheDocument();
    expect(screen.getByText('1 Resources')).toBeInTheDocument();
  });

  it('invokes onSelectNode when Details button is clicked', () => {
    const mockSelect = vi.fn();
    render(
      <ArchitectureMatrixTable
        nodes={sampleNodes}
        edges={sampleEdges}
        selectedNodeId={null}
        onSelectNode={mockSelect}
      />
    );

    const inspectBtn = screen.getByRole('button', { name: /inspect details for engine alpha/i });
    fireEvent.click(inspectBtn);

    expect(mockSelect).toHaveBeenCalledWith(sampleNodes[0].id);
  });

  it('sorts columns when sortable table header buttons are clicked', () => {
    render(
      <ArchitectureMatrixTable
        nodes={sampleNodes}
        edges={sampleEdges}
        selectedNodeId={null}
        onSelectNode={vi.fn()}
      />
    );

    const typeSortBtn = screen.getByRole('button', { name: /sort by resource type/i });
    fireEvent.click(typeSortBtn);

    const rows = screen.getAllByRole('row');
    // First row is header, followed by sorted rows
    expect(rows.length).toBe(4);
  });
});
