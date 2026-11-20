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


import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { GraphEdge, GraphNode, Page, ReasoningEngine } from '../types';
import ArchitectureGraph from '../components/architecture/ArchitectureGraph';
import { ArchitectureMatrixTable } from '../components/architecture/ArchitectureMatrixTable';
import CurlInfoModal from '../components/CurlInfoModal';
import DetailsPanel from '../components/architecture/DetailsPanel';
import { PageShell } from '../components/layout/PageShell';
import { PageHeader } from '../components/layout/PageHeader';
import { SegmentedControl } from '../components/common/Tabs';
import { useArchitectureScanner } from '../hooks/useArchitectureScanner';

const InfoIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
);

const FullScreenIcon: React.FC<{ isFullScreen: boolean }> = ({ isFullScreen }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        {isFullScreen ? (
            <path fillRule="evenodd" d="M5 4a1 1 0 00-2 0v4a1 1 0 002 0V5h3a1 1 0 000-2H5zm10 0a1 1 0 000 2h3v3a1 1 0 002 0V4a1 1 0 00-2 0h-3zm-5 12a1 1 0 000-2H7a1 1 0 00-2 0v-3a1 1 0 00-2 0v4a1 1 0 002 0h5zm5 0a1 1 0 000-2h-3v-3a1 1 0 00-2 0v4a1 1 0 002 0h3z" clipRule="evenodd" />
        ) : (
            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l5.293 5.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-5.293 5.293a1 1 0 01-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l5.293-5.293a1 1 0 011.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-5.293-5.293a1 1 0 011.414-1.414L15 13.586V12a1 1 0 011-1z" clipRule="evenodd" />
        )}
    </svg>
);

const MetricCard: React.FC<{ title: string; value: number; icon: React.ReactElement }> = ({ title, value, icon }) => (
    <div className="bg-gray-900/50 p-4 rounded-lg flex items-center gap-4 border border-gray-700">
        <div className="p-3 rounded-full bg-blue-600/30 text-blue-300">
            {icon}
        </div>
        <div>
            <p className="text-sm font-medium text-gray-400">{title}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
        </div>
    </div>
);

interface ArchitecturePageProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
  onNavigate: (page: Page, context?: any) => void;
  onDirectQuery: (engine: ReasoningEngine) => void;
  projectId?: string;
  nodes?: GraphNode[];
  edges?: GraphEdge[];
  logs?: string[];
  isLoading?: boolean;
  error?: string | null;
  onScan?: () => void;
  onCancelScan?: () => void;
  elapsedSeconds?: number;
}

const ArchitecturePage: React.FC<ArchitecturePageProps> = ({ 
    projectNumber, 
    setProjectNumber: _setProjectNumber, 
    onNavigate, 
    onDirectQuery,
    projectId,
    nodes: propNodes,
    edges: propEdges,
    logs: propLogs,
    isLoading: propIsLoading,
    error: propError,
    onScan: parentOnScan,
    onCancelScan: propOnCancelScan,
    elapsedSeconds: propElapsedSeconds,
}) => {
    const scanner = useArchitectureScanner(projectNumber);

    const nodes = propNodes ?? scanner.nodes;
    const edges = propEdges ?? scanner.edges;
    const logs = propLogs ?? scanner.logs;
    const isLoading = propIsLoading ?? scanner.isLoading;
    const error = propError !== undefined ? propError : scanner.error;
    const onScan = parentOnScan ?? scanner.scan;
    const onCancelScan = propOnCancelScan ?? scanner.cancelScan;
    const elapsedSeconds = propElapsedSeconds ?? scanner.elapsedSeconds;

    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
    const [isLogExpanded, setIsLogExpanded] = useState(false);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'graph' | 'table'>('graph');
    
    // Track previous loading state (keep Scan Log expanded if scan ended with an error)
    const isLoadingRef = useRef(isLoading);
    useEffect(() => {
        if (isLoadingRef.current && !isLoading && !error) { 
            setIsLogExpanded(false); 
        }
        isLoadingRef.current = isLoading;
    }, [isLoading, error]);

    // Exit full-screen canvas mode on Escape key
    useEffect(() => {
        if (!isFullScreen) return;
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                setIsFullScreen(false);
            }
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isFullScreen]);
    
    const handleScanClick = () => {
        setIsLogExpanded(true);
        onScan();
    };

    const handleNodeClick = useCallback((nodeId: string) => {
        setSelectedNodeId(prevId => (prevId === nodeId ? null : nodeId));
    }, []);

    const handleClearSelection = useCallback(() => {
        setSelectedNodeId(null);
    }, []);

    const { edgesByTarget, edgesBySource } = useMemo(() => {
        const byTarget = new Map<string, GraphEdge[]>();
        const bySource = new Map<string, GraphEdge[]>();

        edges.forEach(edge => {
            if (!byTarget.has(edge.target)) byTarget.set(edge.target, []);
            byTarget.get(edge.target)!.push(edge);

            if (!bySource.has(edge.source)) bySource.set(edge.source, []);
            bySource.get(edge.source)!.push(edge);
        });

        return { edgesByTarget: byTarget, edgesBySource: bySource };
    }, [edges]);

    const highlightedGraphElements = useMemo(() => {
        const targetId = hoveredNodeId || selectedNodeId;
        if (!targetId) return { nodeIds: null, edgeIds: null };

        const nodeIds = new Set<string>();
        const edgeIds = new Set<string>();
        
        nodeIds.add(targetId);

        // BFS Upstream
        let queue = [targetId];
        let visited = new Set([targetId]);
        while(queue.length > 0) {
            const curr = queue.shift()!;
            const parents = edgesByTarget.get(curr) || [];
            parents.forEach(e => {
                edgeIds.add(e.id);
                if (!visited.has(e.source)) {
                    visited.add(e.source);
                    nodeIds.add(e.source);
                    queue.push(e.source);
                }
            });
        }

        // BFS Downstream
        queue = [targetId];
        visited = new Set([targetId]);
        while(queue.length > 0) {
            const curr = queue.shift()!;
            const children = edgesBySource.get(curr) || [];
            children.forEach(e => {
                edgeIds.add(e.id);
                if (!visited.has(e.target)) {
                    visited.add(e.target);
                    nodeIds.add(e.target);
                    queue.push(e.target);
                }
            });
        }

        return { nodeIds, edgeIds };
    }, [hoveredNodeId, selectedNodeId, edgesBySource, edgesByTarget]);

    const visibleNodeIds = useMemo(() => {
        // Case 1: Search Query is active
        if (searchQuery.trim()) {
            const lowerQuery = searchQuery.toLowerCase();
            const matchingNodes = nodes.filter(n => 
                (n.label || '').toLowerCase().includes(lowerQuery) || 
                (n.id || '').toLowerCase().includes(lowerQuery) ||
                (n.type || '').toLowerCase().includes(lowerQuery)
            );
            return new Set(matchingNodes.map(n => n.id));
        }

        // Case 2: Node is selected (Traverse graph)
        if (selectedNodeId) {
            const visible = new Set<string>([selectedNodeId]);
            
            // Traverse Downstream
            const queueDown = [selectedNodeId];
            const visitedDown = new Set<string>([selectedNodeId]);
            while(queueDown.length > 0) {
                const curr = queueDown.shift()!;
                const children = edgesBySource.get(curr) || [];
                children.forEach(e => {
                    if (!visitedDown.has(e.target)) {
                        visitedDown.add(e.target);
                        visible.add(e.target);
                        queueDown.push(e.target);
                    }
                });
            }

            // Traverse Upstream
            const queueUp = [selectedNodeId];
            const visitedUp = new Set<string>([selectedNodeId]);
            while(queueUp.length > 0) {
                const curr = queueUp.shift()!;
                const parents = edgesByTarget.get(curr) || [];
                parents.forEach(e => {
                    if (!visitedUp.has(e.source)) {
                        visitedUp.add(e.source);
                        visible.add(e.source);
                        queueUp.push(e.source);
                    }
                });
            }
            return visible;
        }

        // Case 3: Show all
        return null;
    }, [selectedNodeId, searchQuery, nodes, edgesBySource, edgesByTarget]);

    const selectedNode = useMemo(() => selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null, [selectedNodeId, nodes]);

    const metrics = useMemo(() => {
        if (nodes.length === 0) {
            return { totalAgents: 0, totalEngines: 0, totalDataStores: 0, totalServices: 0 };
        }
        const agents = nodes.filter(n => n.type === 'Agent');
        const reasoningEngines = nodes.filter(n => n.type === 'ReasoningEngine');
        const dataStores = nodes.filter(n => n.type === 'DataStore');
        const services = nodes.filter(n => n.type === 'CloudRunService');

        return {
            totalAgents: agents.length,
            totalEngines: reasoningEngines.length,
            totalDataStores: dataStores.length,
            totalServices: services.length,
        };
    }, [nodes]);

    return (
        <PageShell variant="locked">
            {isInfoModalOpen && (
                <CurlInfoModal infoKey="ArchitectureScan" onClose={() => setIsInfoModalOpen(false)} />
            )}

            <PageHeader
                title="Architecture"
                subtitle="Interactive topology and dependency lineage across Apps, Assistants, Agents, Runtimes, and Data Stores."
                consolePage={Page.ARCHITECTURE}
                projectId={projectId}
                projectNumber={projectNumber}
                secondaryActions={
                    <>
                        {isLoading && onCancelScan && (
                            <button
                                type="button"
                                onClick={onCancelScan}
                                className="inline-flex items-center justify-center px-3.5 h-9 rounded-lg bg-red-600/90 hover:bg-red-600 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
                                title="Cancel ongoing architecture scan"
                            >
                                Cancel Scan
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setIsInfoModalOpen(true)}
                            aria-label="Show API commands for scanning"
                            className="inline-flex items-center justify-center px-2.5 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white transition-colors shrink-0"
                            title="Show API commands for scanning"
                        >
                            <InfoIcon />
                        </button>
                    </>
                }
                primaryAction={{
                    label: isLoading
                        ? `Scanning...${elapsedSeconds !== undefined ? ` (${elapsedSeconds}s)` : ''}`
                        : 'Scan Project',
                    onClick: handleScanClick,
                    disabled: isLoading || !projectNumber,
                    icon: isLoading ? (
                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 border-white shrink-0" />
                    ) : undefined,
                }}
            />

            {/* Metrics */}
            {nodes.length > 0 && !isLoading && (
                <div className="bg-gray-900/80 border border-gray-800 p-4 rounded-xl shadow-md shrink-0">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <MetricCard title="Agents" value={metrics.totalAgents} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>} />
                        <MetricCard title="Agent Engines" value={metrics.totalEngines} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>} />
                        <MetricCard title="Data Stores" value={metrics.totalDataStores} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4" /></svg>} />
                        <MetricCard title="Cloud Run Services" value={metrics.totalServices} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 5a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm14 1a1 1 0 11-2 0 1 1 0 012 0zM2 13a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2zm14 1a1 1 0 11-2 0 1 1 0 012 0z" /></svg>} />
                    </div>
                </div>
            )}

            {/* Logs */}
            {(logs.length > 0 || error) && (
                 <div className="bg-gray-900/85 border border-gray-800 p-4 rounded-xl shadow-md shrink-0">
                    <button type="button" onClick={() => setIsLogExpanded(p => !p)} className="flex justify-between items-center w-full text-left">
                        <h3 className="text-md font-semibold text-white">Scan Log</h3>
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-gray-400 transition-transform ${isLogExpanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                           <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                    {isLogExpanded && (
                        <div className="mt-2">
                            {error && <div className="text-sm text-red-400 p-2 mb-2 bg-red-900/20 rounded-md">{error}</div>}
                            <pre className="bg-gray-950 text-xs text-gray-300 p-3 rounded-md h-32 overflow-y-auto font-mono border border-gray-800">
                                {logs.join('\n')}
                            </pre>
                        </div>
                    )}
                 </div>
            )}
            
            {/* Graph Container */}
            <div className={isFullScreen ? "fixed inset-0 z-50 bg-gray-900 flex" : "flex-1 bg-gray-900/85 border border-gray-800 rounded-xl shadow-md overflow-hidden min-h-[500px] flex relative"}>
                
                {/* Graph Controls Overlay */}
                <div className="absolute top-4 right-4 z-10 flex flex-wrap items-center justify-end gap-2 max-w-[calc(100%-2rem)]">
                    {/* View Mode Toggle: Graph vs Accessible Table */}
                    {nodes.length > 0 && !isLoading && (
                        <SegmentedControl
                            size="xs"
                            ariaLabel="Architecture View Mode"
                            value={viewMode}
                            onChange={setViewMode}
                            items={[
                                {
                                    id: 'graph',
                                    label: 'Graph',
                                    title: 'Interactive Graph View',
                                    icon: (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                                        </svg>
                                    ),
                                },
                                {
                                    id: 'table',
                                    label: 'Table (WCAG)',
                                    title: 'Accessible Table Matrix View (WCAG 2.1.1)',
                                    icon: (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                        </svg>
                                    ),
                                },
                            ]}
                        />
                    )}

                    {/* Search Input */}
                    <div className="relative">
                        <input 
                            type="text" 
                            placeholder="Filter resources..."
                            aria-label="Filter architecture resources"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-8 bg-gray-900/90 backdrop-blur-sm border border-gray-700 rounded-lg px-3 text-xs sm:text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-44 sm:w-64 shadow-lg"
                        />
                        {searchQuery && (
                            <button 
                                type="button"
                                aria-label="Clear resource filter"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 top-1.5 text-gray-400 hover:text-white"
                            >
                                &times;
                            </button>
                        )}
                    </div>

                    <button 
                        type="button"
                        onClick={() => setIsFullScreen(!isFullScreen)} 
                        aria-label={isFullScreen ? "Exit Full Screen" : "Full Screen"}
                        className="p-1.5 bg-gray-900/90 backdrop-blur-sm rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 border border-gray-700 shadow-lg transition-colors"
                        title={isFullScreen ? "Exit Full Screen (Esc)" : "Full Screen"}
                    >
                        <FullScreenIcon isFullScreen={isFullScreen} />
                    </button>
                </div>

                <div className="flex-1 relative w-full h-full">
                    {isLoading && nodes.length === 0 ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="text-center">
                                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
                                <p className="mt-4 text-gray-400">Scanning project resources...</p>
                            </div>
                        </div>
                    ) : !isLoading && nodes.length === 0 && logs.length === 0 ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="text-center text-gray-500">
                                <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                <h3 className="mt-2 text-sm font-medium text-gray-300">No Architecture to Display</h3>
                                <p className="mt-1 text-sm">Click &quot;Scan Project&quot; to begin.</p>
                            </div>
                        </div>
                    ) : viewMode === 'table' ? (
                        <ArchitectureMatrixTable
                            nodes={nodes}
                            edges={edges}
                            selectedNodeId={selectedNodeId}
                            onSelectNode={handleNodeClick}
                            searchQuery={searchQuery}
                        />
                    ) : (
                        <ArchitectureGraph
                            nodes={nodes}
                            edges={edges}
                            onNodeClick={handleNodeClick}
                            selectedNodeId={selectedNodeId}
                            highlightedNodeIds={highlightedGraphElements.nodeIds}
                            highlightedEdgeIds={highlightedGraphElements.edgeIds}
                            onNodeHover={setHoveredNodeId}
                            visibleNodeIds={visibleNodeIds}
                            isFullScreen={isFullScreen}
                        />
                    )}
                </div>
                
                {/* Popup Panel (Absolute Positioned over Graph) */}
                <DetailsPanel
                    node={selectedNode}
                    edges={edges}
                    nodes={nodes}
                    projectNumber={projectNumber}
                    onClose={handleClearSelection}
                    onNavigate={onNavigate}
                    onDirectQuery={onDirectQuery}
                />
            </div>
        </PageShell>
    );
};

export default ArchitecturePage;
