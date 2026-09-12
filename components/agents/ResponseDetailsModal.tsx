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

interface ResponseDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  details: {
    diagnostics?: any;
    citations?: any[];
    groundingMetadata?: any;
  } | null;
}

const ResponseDetailsModal: React.FC<ResponseDetailsModalProps> = ({ isOpen, onClose, details }) => {
  if (!isOpen || !details) return null;

  const toolSteps: any[] = [];
  let dataSources: { name: string; title: string }[] = [];

  const uniqueDataStores = new Map<string, { name: string; title: string }>();

  // --- Logic for streamAssist (diagnostics & citations) ---
  if (details.diagnostics || details.citations) {
    const plannerSteps = details.diagnostics?.plannerSteps || [];
    const refusedDataStoreResources = new Set<string>();

    // 1. Process Planner Steps for Tool Usage and "Inferred" Data Stores
    for (let i = 0; i < plannerSteps.length; i++) {
      const step = plannerSteps[i];
      const executableCodePart = step.planStep?.parts?.find((p: any) => p.executableCode);

      if (executableCodePart) {
        const code = executableCodePart.executableCode.code;
        let toolName = 'Code Execution';
        
        // Attempt to identify tool name from variable usage (e.g., search_tool_1.search)
        const searchMatch = code.match(/print\(([^.]+)\.search/);
        if (searchMatch && searchMatch[1]) {
          toolName = `Tool: ${searchMatch[1]}`;
        }

        let toolOutput = '[No output found in subsequent steps]';
        // Look ahead for the result of this specific code block
        for (let j = i + 1; j < plannerSteps.length; j++) {
          const nextStep = plannerSteps[j];
          const resultPart = nextStep.planStep?.parts?.find((p: any) => p.codeExecutionResult);
          if (resultPart) {
            toolOutput = resultPart.codeExecutionResult.output;
            i = j; // Advance outer loop as we consumed this result
            break;
          }
        }
        
        // Capture Tool Usage
        toolSteps.push({
          toolStep: { tool: toolName, toolInput: code, toolOutput: toolOutput }
        });

        // Check for Permission Denied or Resource Path in tool output to identify Data Stores
        const lowerOutput = String(toolOutput).toLowerCase();
        const resourceMatch = lowerOutput.match(/(projects\/[^\s/]+\/locations\/[^\s/]+\/collections\/[^\s/]+\/dataStores\/([^\s"']+))/);
        
        if (resourceMatch && resourceMatch[1]) {
            const fullPath = resourceMatch[1];
            const dsId = resourceMatch[2];
            if (lowerOutput.includes('permission_denied') || lowerOutput.includes('access was denied')) {
                refusedDataStoreResources.add(fullPath);
            } else {
                if (!uniqueDataStores.has(fullPath)) {
                    uniqueDataStores.set(fullPath, { name: fullPath, title: dsId });
                }
            }
        }
      }
    }

    // 2. Process Citations (Grounded References)
    (details.citations || []).forEach(reference => {
      const docPath = reference?.documentMetadata?.document;
      if (docPath) {
        const parts = docPath.split('/');
        const dsIndex = parts.indexOf('dataStores');
        if (dsIndex > -1 && dsIndex < parts.length - 1) {
          const dataStoreId = parts[dsIndex + 1];
          const dataStoreKey = parts.slice(0, dsIndex + 2).join('/');
          
          // Only add if not explicitly refused (403) and not already found in tool steps
          if (!refusedDataStoreResources.has(dataStoreKey) && !uniqueDataStores.has(dataStoreKey)) {
            uniqueDataStores.set(dataStoreKey, { name: dataStoreKey, title: dataStoreId });
          }
        }
      }
    });
  }

  // --- Logic for streamQuery (groundingMetadata) ---
  if (details.groundingMetadata) {
    const groundingChunks = details.groundingMetadata.grounding_chunks || [];
    groundingChunks.forEach((chunk: any) => {
      const docPath = chunk.retrieved_context?.document_name;
      if (docPath) {
        const parts = docPath.split('/');
        const dsIndex = parts.indexOf('dataStores');
        if (dsIndex > -1 && dsIndex < parts.length - 1) {
          const dataStoreId = parts[dsIndex + 1];
          const dataStoreKey = parts.slice(0, dsIndex + 2).join('/');
          if (!uniqueDataStores.has(dataStoreKey)) {
            uniqueDataStores.set(dataStoreKey, { name: dataStoreKey, title: dataStoreId });
          }
        }
      }
    });
  }
  
  dataSources = Array.from(uniqueDataStores.values());
  const hasTools = toolSteps.length > 0;
  const hasDataSources = dataSources.length > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4" aria-modal="true" role="dialog">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-gray-700">
        <header className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">Response Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
        </header>

        <main className="p-6 overflow-y-auto space-y-6">
          {!hasTools && !hasDataSources ? (
            <p className="text-gray-400 text-center">No detailed tool or data store information was found for this response.</p>
          ) : (
            <>
              {hasDataSources && (
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4z" /><path d="M3 8a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V8z" /><path d="M3 12a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z" />
                    </svg>
                    Data Sources Accessed
                  </h3>
                   <ul className="space-y-2">
                    {dataSources.map((source: any, index: number) => (
                      <li key={index} className="bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                        <p className="text-sm font-semibold text-green-400">Data Store</p>
                        <p className="text-xs font-mono text-gray-300 mt-1 truncate" title={source.name}>{source.title}</p>
                        <p className="text-[10px] text-gray-500 font-mono mt-1 opacity-50 truncate">{source.name}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {hasTools && (
                <div className="border-t border-gray-700 pt-6">
                  <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.532 1.532 0 01-.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                    </svg>
                    Tool Execution Log
                  </h3>
                  <div className="space-y-4">
                    {toolSteps.map((step: any, index: number) => (
                      <div key={index} className="bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                        <p className="text-sm font-semibold text-blue-400 font-mono">{step.toolStep.tool}</p>
                        <div className="mt-2 space-y-2 text-xs">
                          <div>
                            <p className="font-bold text-gray-400">Input:</p>
                            <pre className="bg-gray-800 p-2 rounded mt-1 whitespace-pre-wrap font-mono text-gray-300"><code>{step.toolStep.toolInput}</code></pre>
                          </div>
                          <div>
                            <p className="font-bold text-gray-400">Output:</p>
                            <pre className="bg-gray-800 p-2 rounded mt-1 whitespace-pre-wrap font-mono text-gray-300"><code>{typeof step.toolStep.toolOutput === 'object' ? JSON.stringify(step.toolStep.toolOutput, null, 2) : step.toolStep.toolOutput}</code></pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
        
        <footer className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">Close</button>
        </footer>
      </div>
    </div>
  );
};

export default ResponseDetailsModal;
