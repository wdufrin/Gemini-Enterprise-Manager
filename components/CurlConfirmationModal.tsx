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
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-[100] p-4 animate-fade-in" aria-modal="true" role="dialog">
            <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl border border-gray-700 flex flex-col max-h-[90vh]">
                <header className="p-4 border-b border-gray-700 flex items-center justify-between bg-gray-900/50 rounded-t-xl">
                    <div className="flex items-center gap-2 text-blue-400">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <h2 className="text-lg font-bold text-white">Confirm Interaction Details</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </header>

                <main className="p-6 overflow-hidden flex flex-col flex-1">
                    <p className="text-sm text-gray-300 mb-4">
                        You have &quot;Show Interaction Details&quot; enabled. Please review the equivalent API command before proceeding.
                    </p>
                    
                    <div className="flex-1 overflow-auto bg-gray-950 p-4 rounded-lg border border-gray-700 relative group">
                         <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all">
                            {curlCommand}
                         </pre>
                         <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(curlCommand)}
                            className="absolute top-2 right-2 p-1.5 bg-gray-800 text-gray-400 rounded hover:text-white hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Copy to clipboard"
                         >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                         </button>
                    </div>
                </main>

                <footer className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end space-x-3 rounded-b-xl">
                    <button 
                        onClick={onClose} 
                        disabled={isExecuting} 
                        className="px-4 py-2 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isExecuting}
                        className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-blue-800 flex items-center shadow-lg"
                    >
                        {isExecuting ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                                Executing...
                            </>
                        ) : 'Confirm & Execute'}
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default CurlConfirmationModal;
