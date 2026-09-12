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


import React, { useState, useEffect, useRef } from 'react';
import * as api from '../../services/apiService';

interface CloudBuildProgressProps {
    projectId: string;
    buildId: string;
    onClose?: () => void;
}

const CloudBuildProgress: React.FC<CloudBuildProgressProps> = ({ projectId, buildId, onClose }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [status, setStatus] = useState<string>('QUEUED');
    const [progress, setProgress] = useState(0);
    const [isPolling, setIsPolling] = useState(true);
    const [logs, setLogs] = useState<string[]>([]);
    const logsEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom of logs
    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, isExpanded]);


    const calculateProgress = (build: any) => {
        if (build.status === 'SUCCESS') return 100;
        if (['FAILURE', 'INTERNAL_ERROR', 'TIMEOUT', 'CANCELLED', 'EXPIRED'].includes(build.status)) return 100; // Full bar but red? Or stop? User asked for green filler... maybe red if failed.

        if (!build.steps || build.steps.length === 0) {
            // Fallback for no steps: periodic increment?
            // For now, return a static 'starting' value or rely on a timer based fake progress if we wanted complex logic.
            // Let's just return 5% to show something.
            return 5;
        }

        const total = build.steps.length;
        const completed = build.steps.filter((s: any) => s.status === 'SUCCESS').length;
        const working = build.steps.some((s: any) => s.status === 'WORKING');

        // Base progress
        let p = (completed / total) * 100;

        // Add a bit for working step
        if (working) {
            p += (0.5 / total) * 100;
        }

        return Math.min(Math.max(p, 5), 95); // Clamp between 5 and 95
    };

    useEffect(() => {
        if (!isPolling) return;

        const poll = async () => {
            try {
                // 1. Get Status
                const build = await api.getCloudBuild(projectId, buildId);
                const currentStatus = build.status;
                setStatus(currentStatus);
                setProgress(calculateProgress(build));

                // 2. Get Logs
                const newLogs = await api.fetchBuildLogs(projectId, buildId);
                setLogs(newLogs);

                // 3. Check for completion
                if (['SUCCESS', 'FAILURE', 'INTERNAL_ERROR', 'TIMEOUT', 'CANCELLED', 'EXPIRED'].includes(currentStatus)) {
                    setIsPolling(false);
                    if (currentStatus === 'SUCCESS') setProgress(100);
                }
            } catch (err) {
                console.error("Error polling build:", err);
            }
        };

        // Initial poll
        poll();

        const intervalId = setInterval(poll, 3000);
        return () => clearInterval(intervalId);
    }, [projectId, buildId, isPolling]);

    const isFinished = !isPolling;
    const isSuccess = status === 'SUCCESS';
    const isFailure = ['FAILURE', 'INTERNAL_ERROR', 'TIMEOUT', 'CANCELLED', 'EXPIRED'].includes(status);

    const resourceNameMatch = logs.find(log => log.includes('Resource Name: '));
    const resourceName = resourceNameMatch ? resourceNameMatch.split('Resource Name: ')[1]?.trim() : null;

    const getStatusColor = () => {
        if (status === 'SUCCESS') return 'text-green-400';
        if (['FAILURE', 'INTERNAL_ERROR', 'TIMEOUT', 'CANCELLED', 'EXPIRED'].includes(status)) return 'text-red-400';
        if (['QUEUED', 'PENDING'].includes(status)) return 'text-yellow-400';
        if (['WORKING', 'BUILDING'].includes(status)) return 'text-blue-400';
        return 'text-gray-400';
    };

    const getBorderColor = () => {
        if (status === 'SUCCESS') return 'border-green-500';
        if (['FAILURE', 'INTERNAL_ERROR', 'TIMEOUT', 'CANCELLED', 'EXPIRED'].includes(status)) return 'border-red-500';
        if (['QUEUED', 'PENDING'].includes(status)) return 'border-yellow-500';
        if (['WORKING', 'BUILDING'].includes(status)) return 'border-blue-500';
        return 'border-gray-500';
    };

    const getStatusText = () => {
        if (status === 'SUCCESS') {
            return resourceName ? `Success: ${resourceName}` : 'Build completed — verify resource';
        }
        if (['FAILURE', 'INTERNAL_ERROR', 'TIMEOUT', 'CANCELLED', 'EXPIRED'].includes(status)) return 'Failed';
        if (['QUEUED', 'PENDING'].includes(status)) return 'Queued...';
        if (['WORKING', 'BUILDING'].includes(status)) return 'Building...';
        return status;
    };

    if (isExpanded) {
        return (
            <div className={`w-[600px] h-[400px] bg-gray-900 rounded-lg shadow-2xl border flex flex-col ${getBorderColor()}`}>
                <div className="p-3 border-b border-gray-700 flex justify-between items-center bg-gray-800 rounded-t-lg">
                    <div className="flex items-center gap-2">
                        <span className={`font-bold ${getStatusColor()}`}>
                            {getStatusText()}
                        </span>
                        <span className="text-xs text-gray-400 font-mono">{buildId.substring(0, 8)}...</span>
                        {/* Progress Bar inside Expded View? Maybe at bottom of header */}
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                        <button onClick={() => setIsExpanded(false)} className="text-gray-400 hover:text-white" title="Minimize">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                            </svg>
                        </button>
                        <button onClick={onClose} className="text-gray-400 hover:text-white" title="Close">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-auto p-4 bg-black font-mono text-xs text-gray-300">
                    {logs.length === 0 ? (
                        <p className="text-gray-500 italic">Fetching logs...</p>
                    ) : (
                        logs.map((log, i) => (
                            <div key={i} className="whitespace-pre-wrap mb-1 border-b border-gray-900 pb-1">{log}</div>
                        ))
                    )}
                    <div ref={logsEndRef} />
                </div>
            </div>
        );
    }

    return (
        <div 
            onClick={() => setIsExpanded(true)}
            className={`bg-gray-800 rounded-full shadow-lg border ${getBorderColor()} p-1 pl-4 pr-2 flex items-center gap-3 cursor-pointer hover:bg-gray-700 transition-all w-fit max-w-lg relative overflow-hidden`}
        >


            <div className="flex items-center gap-2 relative z-10">
                {!isFinished ? (
                    <div className={`animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 ${['QUEUED', 'PENDING'].includes(status) ? 'border-yellow-400' : 'border-blue-400'}`}></div>
                ) : isSuccess ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                )}
                <div className="flex flex-col py-1">
                    <span className="text-sm font-medium text-white truncate">
                        {getStatusText()}
                    </span>
                    {isSuccess && (
                        <a 
                            href={`https://console.cloud.google.com/vertex-ai/reasoning-engines?project=${projectId}`} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="text-xs text-blue-400 hover:underline inline-block mt-0.5" 
                            onClick={(e) => e.stopPropagation()}
                        >
                            View in Cloud Console
                        </a>
                    )}
                </div>
            </div>
            <button 
                onClick={(e) => { e.stopPropagation(); onClose && onClose(); }}
                className="p-1 rounded-full hover:bg-gray-600 text-gray-400 hover:text-white relative z-10 flex-shrink-0"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
            </button>
        </div>
    );
};

export default CloudBuildProgress;
