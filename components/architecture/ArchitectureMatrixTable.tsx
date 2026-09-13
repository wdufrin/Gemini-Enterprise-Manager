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

import React, { useMemo, useState } from 'react';
import { GraphNode, GraphEdge } from '../../types';

interface ArchitectureMatrixTableProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  searchQuery?: string;
}

type SortColumn = 'label' | 'type' | 'inCount' | 'outCount';
type SortDir = 'asc' | 'desc';

export const ArchitectureMatrixTable: React.FC<ArchitectureMatrixTableProps> = ({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  searchQuery = '',
}) => {
  const [sortCol, setSortCol] = useState<SortColumn>('label');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Build node lookup map
  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphNode>();
    nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [nodes]);

  // Map incoming and outgoing connections
  const { incomingMap, outgoingMap } = useMemo(() => {
    const inc = new Map<string, string[]>();
    const out = new Map<string, string[]>();

    nodes.forEach((n) => {
      inc.set(n.id, []);
      out.set(n.id, []);
    });

    edges.forEach((e) => {
      if (out.has(e.source)) {
        out.get(e.source)!.push(e.target);
      }
      if (inc.has(e.target)) {
        inc.get(e.target)!.push(e.source);
      }
    });

    return { incomingMap: inc, outgoingMap: out };
  }, [nodes, edges]);

  // Filter nodes
  const filteredNodes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return nodes;
    return nodes.filter(
      (n) =>
        n.label.toLowerCase().includes(q) ||
        n.id.toLowerCase().includes(q) ||
        n.type.toLowerCase().includes(q)
    );
  }, [nodes, searchQuery]);

  // Sort nodes
  const sortedNodes = useMemo(() => {
    return [...filteredNodes].sort((a, b) => {
      let comparison = 0;
      if (sortCol === 'label') {
        comparison = a.label.localeCompare(b.label);
      } else if (sortCol === 'type') {
        comparison = a.type.localeCompare(b.type);
      } else if (sortCol === 'inCount') {
        const aCount = incomingMap.get(a.id)?.length || 0;
        const bCount = incomingMap.get(b.id)?.length || 0;
        comparison = aCount - bCount;
      } else if (sortCol === 'outCount') {
        const aCount = outgoingMap.get(a.id)?.length || 0;
        const bCount = outgoingMap.get(b.id)?.length || 0;
        comparison = aCount - bCount;
      }
      return sortDir === 'asc' ? comparison : -comparison;
    });
  }, [filteredNodes, sortCol, sortDir, incomingMap, outgoingMap]);

  const handleSort = (col: SortColumn) => {
    if (sortCol === col) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'Agent':
        return 'bg-purple-900/50 text-purple-300 border-purple-700/50';
      case 'ReasoningEngine':
        return 'bg-blue-900/50 text-blue-300 border-blue-700/50';
      case 'DataStore':
        return 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50';
      case 'CloudRunService':
        return 'bg-amber-900/50 text-amber-300 border-amber-700/50';
      default:
        return 'bg-gray-800 text-gray-300 border-gray-700';
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-gray-900/90 text-gray-200 overflow-hidden rounded-lg">
      <div className="p-3 bg-gray-800/80 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Accessible Matrix View (WCAG 2.1.1 Fallback)
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300 font-mono">
            {sortedNodes.length} Resources
          </span>
        </div>
        <span className="text-xs text-gray-400">
          Click any resource to inspect its configuration and connections.
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        <table
          className="min-w-full divide-y divide-gray-800 text-left text-xs"
          aria-label="Architecture Topology Matrix"
        >
          <thead className="bg-gray-800/90 sticky top-0 z-10">
            <tr>
              <th
                scope="col"
                aria-sort={
                  sortCol === 'label'
                    ? sortDir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
                className="px-4 py-3 font-medium text-gray-300 uppercase tracking-wider"
              >
                <button
                  type="button"
                  onClick={() => handleSort('label')}
                  className="flex items-center gap-1 uppercase hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 rounded p-0.5"
                  aria-label="Sort by Resource Name"
                >
                  <span>Resource Name</span>
                  {sortCol === 'label' && (
                    <span>{sortDir === 'asc' ? '▲' : '▼'}</span>
                  )}
                </button>
              </th>
              <th
                scope="col"
                aria-sort={
                  sortCol === 'type'
                    ? sortDir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
                className="px-4 py-3 font-medium text-gray-300 uppercase tracking-wider"
              >
                <button
                  type="button"
                  onClick={() => handleSort('type')}
                  className="flex items-center gap-1 uppercase hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 rounded p-0.5"
                  aria-label="Sort by Resource Type"
                >
                  <span>Type</span>
                  {sortCol === 'type' && (
                    <span>{sortDir === 'asc' ? '▲' : '▼'}</span>
                  )}
                </button>
              </th>
              <th
                scope="col"
                aria-sort={
                  sortCol === 'inCount'
                    ? sortDir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
                className="px-4 py-3 font-medium text-gray-300 uppercase tracking-wider"
              >
                <button
                  type="button"
                  onClick={() => handleSort('inCount')}
                  className="flex items-center gap-1 uppercase hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 rounded p-0.5"
                  aria-label="Sort by Incoming Connections"
                >
                  <span>Called By (Inbound)</span>
                  {sortCol === 'inCount' && (
                    <span>{sortDir === 'asc' ? '▲' : '▼'}</span>
                  )}
                </button>
              </th>
              <th
                scope="col"
                aria-sort={
                  sortCol === 'outCount'
                    ? sortDir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
                className="px-4 py-3 font-medium text-gray-300 uppercase tracking-wider"
              >
                <button
                  type="button"
                  onClick={() => handleSort('outCount')}
                  className="flex items-center gap-1 uppercase hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 rounded p-0.5"
                  aria-label="Sort by Outgoing Connections"
                >
                  <span>Connects To (Outbound)</span>
                  {sortCol === 'outCount' && (
                    <span>{sortDir === 'asc' ? '▲' : '▼'}</span>
                  )}
                </button>
              </th>
              <th
                scope="col"
                className="px-4 py-3 font-medium text-gray-300 uppercase tracking-wider text-right"
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/80 bg-gray-900/60">
            {sortedNodes.map((node) => {
              const isSelected = node.id === selectedNodeId;
              const inNodes = (incomingMap.get(node.id) || [])
                .map((id) => nodeMap.get(id))
                .filter(Boolean) as GraphNode[];
              const outNodes = (outgoingMap.get(node.id) || [])
                .map((id) => nodeMap.get(id))
                .filter(Boolean) as GraphNode[];

              return (
                <tr
                  key={node.id}
                  className={`transition-colors ${
                    isSelected
                      ? 'bg-blue-950/60 border-l-4 border-blue-500'
                      : 'hover:bg-gray-800/50'
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold text-white">{node.label}</div>
                    <div
                      className="text-[11px] text-gray-400 font-mono truncate max-w-xs"
                      title={node.id}
                    >
                      {node.id}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-medium border ${getTypeBadgeColor(
                        node.type
                      )}`}
                    >
                      {node.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {inNodes.length === 0 ? (
                      <span className="text-gray-500 italic text-[11px]">None</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {inNodes.map((source) => (
                          <button
                            key={source.id}
                            type="button"
                            onClick={() => onSelectNode(source.id)}
                            className="px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 text-[10px] truncate max-w-[140px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                            title={`Jump to ${source.label}`}
                          >
                            ← {source.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {outNodes.length === 0 ? (
                      <span className="text-gray-500 italic text-[11px]">None</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {outNodes.map((target) => (
                          <button
                            key={target.id}
                            type="button"
                            onClick={() => onSelectNode(target.id)}
                            className="px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 text-[10px] truncate max-w-[140px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                            title={`Jump to ${target.label}`}
                          >
                            → {target.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onSelectNode(node.id)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-800 text-blue-400 hover:bg-gray-700 border border-gray-700'
                      }`}
                      aria-label={`Inspect details for ${node.label}`}
                    >
                      {isSelected ? 'Inspecting' : 'Details'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {sortedNodes.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="text-center py-8 text-gray-500 italic text-sm"
                >
                  No matching resources found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ArchitectureMatrixTable;
