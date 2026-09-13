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

import React, { useState } from 'react';
import Modal from './common/Modal';

interface CurlConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    curlCommand: string;
    isExecuting?: boolean;
}

const CurlConfirmationModal: React.FC<CurlConfirmationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    curlCommand,
    isExecuting = false,
}) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(curlCommand);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Confirm Interaction Details"
            preventClose={isExecuting}
            size="4xl"
            headerIcon={
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
            }
            footer={
                <>
                    <button 
                        type="button"
                        onClick={onClose} 
                        disabled={isExecuting} 
                        className="px-4 py-2 bg-gray-700 text-gray-300 text-xs font-semibold rounded-md hover:bg-gray-600 disabled:opacity-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isExecuting}
                        className="px-5 py-2 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700 disabled:bg-blue-800 flex items-center shadow-lg transition-colors"
                    >
                        {isExecuting ? (
                            <>
                                <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white/30 border-t-white mr-2"></div>
                                Executing...
                            </>
                        ) : 'Confirm & Execute'}
                    </button>
                </>
            }
        >
            <p className="text-sm text-gray-300 mb-4">
                You have &quot;Show Interaction Details&quot; enabled. Please review the equivalent API command before proceeding.
            </p>
            
            <div className="bg-gray-950 p-4 rounded-lg border border-gray-700 relative group">
                <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all">
                    {curlCommand}
                </pre>
                <button
                    type="button"
                    onClick={handleCopy}
                    className="absolute top-2 right-2 px-2.5 py-1.5 bg-gray-800 text-gray-300 rounded hover:text-white hover:bg-gray-700 text-xs font-medium border border-gray-700 transition-all flex items-center gap-1.5"
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
        </Modal>
    );
};

export default CurlConfirmationModal;
