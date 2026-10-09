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

import React, { useState, useMemo } from 'react';
import Modal from './common/Modal';
import { ApiHistoryItem, useOptionalGlobalDebug } from '../context/GlobalDebugContext';

export interface CurlDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    curlCommand: string;
    title?: string;
    method?: string;
    url?: string;
    requestBody?: unknown;
    status?: number;
    durationMs?: number;
    responseBody?: unknown;
    errorMessage?: string;
    historyItem?: ApiHistoryItem | null;
}

const formatJsonPayload = (payload: unknown): string => {
    if (payload === undefined || payload === null) return '';
    if (typeof payload === 'string') {
        try {
            return JSON.stringify(JSON.parse(payload), null, 2);
        } catch {
            return payload;
        }
    }
    try {
        return JSON.stringify(payload, null, 2);
    } catch (err: unknown) {
        console.warn('[CurlDetailsModal] Non-JSON-serializable payload fallback:', err);
        return String(payload);
    }
};

const CurlDetailsModal: React.FC<CurlDetailsModalProps> = ({
    isOpen,
    onClose,
    curlCommand,
    title = "API Interaction Details",
    method,
    url,
    requestBody,
    status,
    durationMs,
    responseBody,
    errorMessage,
    historyItem,
}) => {
    const [copied, setCopied] = useState(false);
    const [copiedResponse, setCopiedResponse] = useState(false);
    const debugContext = useOptionalGlobalDebug();

    const matchedItem = useMemo(() => {
        if (historyItem) return historyItem;
        if (!curlCommand || !debugContext?.apiHistory?.length) return undefined;
        return debugContext.apiHistory.find((item) => item.curlCommand === curlCommand);
    }, [historyItem, curlCommand, debugContext?.apiHistory]);

    const resolvedMethod = method ?? matchedItem?.method;
    const resolvedUrl = url ?? matchedItem?.url;
    const resolvedRequestBody = requestBody !== undefined ? requestBody : matchedItem?.requestBody;
    const resolvedStatus = status !== undefined ? status : matchedItem?.status;
    const resolvedDurationMs = durationMs !== undefined ? durationMs : matchedItem?.durationMs;
    const resolvedResponseBody = responseBody !== undefined ? responseBody : matchedItem?.responseBody;
    const resolvedErrorMessage = errorMessage !== undefined ? errorMessage : matchedItem?.errorMessage;

    const formattedResponse = useMemo(
        () => formatJsonPayload(resolvedResponseBody),
        [resolvedResponseBody]
    );
    const formattedRequestBody = useMemo(
        () => formatJsonPayload(resolvedRequestBody),
        [resolvedRequestBody]
    );

    const handleCopy = () => {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            Promise.resolve(navigator.clipboard.writeText(curlCommand)).catch((err: unknown) => {
                console.warn('[CurlDetailsModal] Clipboard write failed:', err);
            });
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleCopyResponse = () => {
        const textToCopy = formattedResponse || resolvedErrorMessage || '';
        if (!textToCopy) return;
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            Promise.resolve(navigator.clipboard.writeText(textToCopy)).catch((err: unknown) => {
                console.warn('[CurlDetailsModal] Clipboard write failed:', err);
            });
        }
        setCopiedResponse(true);
        setTimeout(() => setCopiedResponse(false), 2000);
    };

    const isErrorStatus =
        Boolean(resolvedErrorMessage) ||
        (typeof resolvedStatus === 'number' && (resolvedStatus >= 400 || resolvedStatus === 0));

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            size="5xl"
            headerIcon={
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            }
            footer={
                <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 bg-gray-700 text-white text-xs font-semibold rounded hover:bg-gray-600 transition-colors"
                >
                    Close
                </button>
            }
        >
            {/* Telemetry Summary Bar */}
            {(resolvedMethod || resolvedUrl || resolvedStatus !== undefined || resolvedDurationMs !== undefined) && (
                <div
                    data-testid="curl-modal-telemetry-bar"
                    className="flex flex-wrap items-center justify-between gap-2 bg-gray-900/90 border border-gray-700 rounded-lg px-3.5 py-2 mb-4"
                >
                    <div className="flex items-center gap-2 min-w-0">
                        {resolvedMethod && (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-900/70 text-blue-200 border border-blue-700/60">
                                {resolvedMethod}
                            </span>
                        )}
                        {resolvedUrl && (
                            <span className="text-xs text-gray-300 font-mono truncate" title={resolvedUrl}>
                                {resolvedUrl}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {resolvedStatus !== undefined && (
                            <span
                                data-testid="curl-modal-status-badge"
                                className={`text-xs font-semibold px-2 py-0.5 rounded border ${
                                    isErrorStatus
                                        ? 'bg-red-900/50 text-red-300 border-red-700/60'
                                        : 'bg-emerald-900/50 text-emerald-300 border-emerald-700/60'
                                }`}
                            >
                                {resolvedStatus === 0 ? 'ERR' : `HTTP ${resolvedStatus}`}
                            </span>
                        )}
                        {resolvedDurationMs !== undefined && (
                            <span
                                data-testid="curl-modal-latency-badge"
                                className="text-xs font-mono px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700"
                            >
                                {resolvedDurationMs} ms
                            </span>
                        )}
                    </div>
                </div>
            )}

            <div
                data-testid="curl-modal-comparison-grid"
                className="grid grid-cols-1 lg:grid-cols-2 gap-4"
            >
                {/* Left Pane: Outbound API Request & cURL */}
                <div
                    data-testid="curl-modal-request-pane"
                    className="flex flex-col bg-gray-900/60 border border-gray-700 rounded-lg p-3.5"
                >
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-300">
                                Outbound API Request (Source)
                            </h4>
                            <p className="text-xs text-gray-400">
                                The following cURL command represents the API request:
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleCopy}
                            className="px-2.5 py-1.5 bg-gray-800 text-gray-300 rounded hover:text-white hover:bg-gray-700 text-xs font-medium border border-gray-700 transition-all flex items-center gap-1.5 shrink-0"
                            aria-label="Copy cURL command to clipboard"
                        >
                            {copied ? (
                                <>
                                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Copied</span>
                                </>
                            ) : (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                    <span>Copy</span>
                                </>
                            )}
                        </button>
                    </div>
                    <div className="bg-gray-950 p-3.5 rounded-lg border border-gray-800 overflow-x-auto max-h-80 overflow-y-auto">
                        <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all">
                            {curlCommand}
                        </pre>
                    </div>
                    {formattedRequestBody && (
                        <div className="mt-3">
                            <span className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                                Redacted Request Payload (JSON)
                            </span>
                            <div className="bg-gray-950 p-3 rounded-lg border border-gray-800 max-h-48 overflow-y-auto">
                                <pre
                                    data-testid="curl-modal-request-body"
                                    className="text-xs text-gray-200 font-mono whitespace-pre-wrap break-all"
                                >
                                    {formattedRequestBody}
                                </pre>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Pane: Live Backend Response */}
                <div
                    data-testid="curl-modal-response-pane"
                    className="flex flex-col bg-gray-900/60 border border-gray-700 rounded-lg p-3.5"
                >
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                                Live Backend Response (GCP Result)
                            </h4>
                            <p className="text-xs text-gray-400">
                                Real-time HTTP response returned by Google Cloud:
                            </p>
                        </div>
                        {(formattedResponse || resolvedErrorMessage) && (
                            <button
                                type="button"
                                onClick={handleCopyResponse}
                                className="px-2.5 py-1.5 bg-gray-800 text-gray-300 rounded hover:text-white hover:bg-gray-700 text-xs font-medium border border-gray-700 transition-all flex items-center gap-1.5 shrink-0"
                                aria-label="Copy response JSON to clipboard"
                            >
                                {copiedResponse ? (
                                    <span>Copied Response</span>
                                ) : (
                                    <span>Copy Response</span>
                                )}
                            </button>
                        )}
                    </div>

                    {resolvedErrorMessage && (
                        <div
                            data-testid="curl-modal-error-banner"
                            role="alert"
                            className="mb-3 p-3 rounded-lg bg-red-950/60 border border-red-800/80 text-xs text-red-200"
                        >
                            <span className="font-semibold text-red-300 block mb-0.5">
                                Backend API Error
                            </span>
                            {resolvedErrorMessage}
                        </div>
                    )}

                    {formattedResponse ? (
                        <div className="bg-gray-950 p-3.5 rounded-lg border border-gray-800 overflow-x-auto max-h-96 overflow-y-auto flex-1">
                            <pre
                                data-testid="curl-modal-response-json"
                                className="text-xs text-emerald-300 font-mono whitespace-pre-wrap break-all"
                            >
                                {formattedResponse}
                            </pre>
                        </div>
                    ) : !resolvedErrorMessage ? (
                        <div
                            data-testid="curl-modal-response-empty"
                            className="bg-gray-950/70 p-6 rounded-lg border border-gray-800 text-center text-xs text-gray-400 flex-1 flex items-center justify-center"
                        >
                            No live backend response payload recorded for this command.
                        </div>
                    ) : null}
                </div>
            </div>
        </Modal>
    );
};

export default CurlDetailsModal;

