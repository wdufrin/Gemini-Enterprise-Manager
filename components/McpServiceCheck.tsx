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

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { listMcpTools, checkMcpCompliance } from '../services/apiService';
import { toErrorMessage } from '../utils/errors';
import { Modal } from './common/Modal';

interface McpTool {
    name: string;
    description?: string;
    inputSchema?: {
        required?: string[];
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

interface McpServiceCheckProps {
    projectId: string;
    serviceName: string;
    mcpEndpoint: string;
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}

export const McpServiceCheck: React.FC<McpServiceCheckProps> = ({ projectId, serviceName, mcpEndpoint, label, checked, onChange }) => {
    const [status, setStatus] = useState<'loading' | 'enabled' | 'disabled' | 'error' | 'unchecked'>('unchecked');
    const [showEnablePopup, setShowEnablePopup] = useState(false);
    const [tools, setTools] = useState<McpTool[]>([]);
    const [toolsLoading, setToolsLoading] = useState(false);
    const [toolsError, setToolsError] = useState<string | null>(null);
    const [showTools, setShowTools] = useState(false);
    const [expandedTool, setExpandedTool] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Monotonic id for the in-flight validate/tool-fetch pair. Switching
    // projects or toggling the checkbox restarts the sequence while the
    // previous fetch is still outstanding; without this, a slow response for
    // project A can land after project B's and populate the browser with
    // another project's tools.
    const requestIdRef = useRef(0);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setShowTools(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    /**
     * Populates the Tool Browser.
     *
     * A failure here must never be swallowed. Previously this was a bare
     * `.catch(console.warn)`, so a total transport failure (the MCP CORS
     * regression, an expired token, a 403) rendered as a green
     * "Ready (0 tools)" badge -- visually identical to a healthy service that
     * genuinely exposes no tools. Operators had no way to tell the difference
     * without opening the browser console.
     */
    const loadTools = useCallback(async (requestId: number) => {
        setToolsLoading(true);
        setToolsError(null);
        try {
            const fetched = await listMcpTools(projectId, mcpEndpoint);
            if (requestId !== requestIdRef.current) return;
            setTools(fetched as unknown as McpTool[]);
        } catch (e) {
            if (requestId !== requestIdRef.current) return;
            console.error(`[McpServiceCheck] Tool discovery failed for ${mcpEndpoint}:`, e);
            setTools([]);
            setToolsError(toErrorMessage(e));
        } finally {
            if (requestId === requestIdRef.current) setToolsLoading(false);
        }
    }, [projectId, mcpEndpoint]);

    const validate = useCallback(async () => {
        setStatus('loading');
        const requestId = ++requestIdRef.current;

        try {
            // Use the authoritative MCP compliance check from user (v2beta API)
            const isMcpEnabled = await checkMcpCompliance(projectId, serviceName);
            if (requestId !== requestIdRef.current) return;

            if (!isMcpEnabled) {
                setStatus('disabled');
            } else {
                setStatus('enabled');
                // Tool discovery is separate from the enablement status: the
                // service can be enabled while the MCP surface is unreachable.
                // Both outcomes are reported, neither is inferred from the other.
                void loadTools(requestId);
            }

        } catch (e) {
            if (requestId !== requestIdRef.current) return;
            console.error("Validation failed:", e);
            setStatus('error');
        }
    }, [projectId, serviceName, loadTools]);

    const retryToolDiscovery = useCallback(() => {
        void loadTools(++requestIdRef.current);
    }, [loadTools]);

    useEffect(() => {
        if (checked && projectId) {
            validate();
        } else {
            // Invalidate any in-flight response so it cannot repopulate the
            // browser after the service has been unchecked.
            requestIdRef.current++;
            setStatus('unchecked');
            setTools([]);
            setToolsError(null);
            setToolsLoading(false);
        }
    }, [checked, projectId, validate]);

    return (
        <div className="flex items-center space-x-2 relative" ref={containerRef}>
            <label className="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 bg-gray-700 border-gray-600 rounded" />
                <span className="text-sm text-gray-300">{label}</span>
            </label>

            {checked && projectId && (
                <div className="ml-2 flex items-center">
                    {status === 'loading' && <span className="animate-spin h-3 w-3 border-2 border-gray-500 rounded-full border-t-transparent inline-block"></span>}
                    {status === 'enabled' && (
                        <div className="relative">
                            <span
                                className={`text-lg flex items-center space-x-1 cursor-pointer hover:opacity-80 transition-opacity ${
                                    toolsError ? 'text-amber-500' : 'text-green-500'
                                }`}
                                title={
                                    toolsError
                                        ? `API enabled, but tool discovery failed: ${toolsError}`
                                        : 'Service Ready - Click to view tools'
                                }
                                onClick={() => setShowTools(!showTools)}
                            >
                                <span>●</span>
                                {toolsError ? (
                                    <span className="text-xs text-amber-400">Tools unavailable</span>
                                ) : toolsLoading ? (
                                    <span className="text-xs text-gray-400">Loading tools…</span>
                                ) : (
                                    <span className="text-xs text-green-400">Ready ({tools.length} tools)</span>
                                )}
                            </span>
                            {showTools && (
                                <div className="absolute left-0 mt-2 w-96 max-h-96 overflow-y-auto bg-gray-800 border border-gray-700 rounded-md shadow-lg z-50 p-3 text-xs text-gray-300">
                                    <h4 className="font-bold mb-2 border-b border-gray-700 pb-1">Available Tools</h4>
                                    <div className="text-[11px] text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded px-2 py-1 mb-2">
                                        Requires IAM role <code className="font-mono text-amber-200">roles/mcp.toolUser</code> (<code className="font-mono">mcp.tools.call</code>) for the executing identity.
                                    </div>
                                    {toolsError ? (
                                        <div className="text-[11px] text-red-300 bg-red-950/40 border border-red-800/60 rounded px-2 py-2 space-y-2">
                                            <p className="font-semibold text-red-200">Tool discovery failed</p>
                                            <p className="text-red-300/90 break-words font-mono">{toolsError}</p>
                                            <p className="text-gray-400">
                                                The {serviceName} API is enabled, but its MCP endpoint did not
                                                return a tool list. Tools cannot be verified until this succeeds.
                                            </p>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    retryToolDiscovery();
                                                }}
                                                disabled={toolsLoading}
                                                className="px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-gray-200 transition-colors"
                                            >
                                                {toolsLoading ? 'Retrying…' : 'Retry'}
                                            </button>
                                        </div>
                                    ) : toolsLoading ? (
                                        <p className="italic text-gray-500">Loading tools…</p>
                                    ) : tools.length === 0 ? (
                                        <p className="italic text-gray-500">No tools returned.</p>
                                    ) : (
                                        <ul className="space-y-4">
                                            {tools.map((t, i) => (
                                                <li key={i} className="border-b border-gray-700 pb-2 last:border-0">
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex-1">
                                                            <div className="flex items-center space-x-2">
                                                                <span className="font-semibold text-blue-400 text-sm">{t.name}</span>
                                                                {t.inputSchema?.required && t.inputSchema.required.length > 0 && (
                                                                    <span className="text-[10px] bg-gray-700 text-gray-300 px-1 rounded">
                                                                        {t.inputSchema.required.length} req
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-gray-400 text-xs mt-1">{t.description}</p>
                                                        </div>
                                                        {t.inputSchema && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setExpandedTool(expandedTool === i ? null : i);
                                                                }}
                                                                className="text-xs text-gray-500 hover:text-white ml-2 px-2 py-1 bg-gray-700 rounded transition-colors"
                                                            >
                                                                {expandedTool === i ? 'Hide' : 'Schema'}
                                                            </button>
                                                        )}
                                                    </div>
                                                    {expandedTool === i && t.inputSchema && (
                                                        <div className="mt-2">
                                                            <div className="text-[10px] text-gray-500 uppercase font-semibold mb-1">Input Schema</div>
                                                            <pre className="p-2 bg-gray-900 rounded text-green-300 text-[10px] overflow-x-auto whitespace-pre-wrap">
                                                                {JSON.stringify(t.inputSchema, null, 2)}
                                                            </pre>
                                                        </div>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    {status === 'disabled' && (
                        <button
                            onClick={() => setShowEnablePopup(true)}
                            className="text-red-500 hover:text-red-400 text-lg flex items-center space-x-1 focus:outline-none"
                            title="Service Disabled - Click to Enable"
                        >
                            <span>●</span> <span className="text-xs text-red-400">Disabled (Click to fix)</span>
                        </button>
                    )}
                    {status === 'error' && (
                        <span className="text-yellow-500 text-lg flex items-center space-x-1" title="Service enabled but MCP unreachable (check logs)">
                            <span>●</span> <span className="text-xs text-yellow-400">Unreachable</span>
                        </span>
                    )}
                </div>
            )}

            <Modal
                isOpen={showEnablePopup}
                onClose={() => {
                    setShowEnablePopup(false);
                    validate();
                }}
                title={`Enable MCP for ${serviceName}`}
                size="md"
            >
                <div className="text-gray-300 space-y-3 text-sm">
                    <p>
                        The Managed Context Protocol (MCP) is currently disabled for <b>{serviceName}</b> in project <b>{projectId}</b>.
                    </p>
                    <div className="bg-gray-900 p-3 rounded border border-gray-700">
                        <h4 className="font-semibold text-white mb-2">Instructions to Enable:</h4>
                        <ol className="list-decimal pl-4 space-y-2">
                            <li>Navigate to the Google Cloud Console for project <b>{projectId}</b>.</li>
                            <li>Go to the <b>APIs & Services</b> or the specific service page.</li>
                            <li>Find the settings for <b>{serviceName}</b>.</li>
                            <li>Enable the MCP (Managed Context Protocol) integration in the configuration or organization policy.</li>
                        </ol>
                    </div>
                    <p className="text-xs text-blue-300 mt-2">
                        Note: You may need Organization Administrator privileges to modify MCP policies.
                    </p>
                </div>
                <div className="mt-6 flex justify-end space-x-3">
                    <button
                        type="button"
                        onClick={() => {
                            setShowEnablePopup(false);
                            validate(); // Re-validate upon closing in case they enabled it
                        }}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded"
                    >
                        I&apos;ve Enabled It
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowEnablePopup(false)}
                        className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded"
                    >
                        Close
                    </button>
                </div>
            </Modal>
        </div>
    );
};
