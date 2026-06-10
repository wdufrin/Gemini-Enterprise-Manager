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
import ConnectorVerificationTab from './connectors/ConnectorVerificationTab';
import * as api from '../services/apiService';


interface ConnectorDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  data: any;
  status: 'success' | 'error';
}

const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const ConnectorDetailsModal: React.FC<ConnectorDetailsModalProps> = ({
  isOpen,
  onClose,
  title,
  data,
  status,
}) => {
  const [activeTab, setActiveTab] = React.useState<'diagnostics' | 'verification' | 'config'>('diagnostics');


  if (!isOpen) return null;



  const getRecommendation = (data: any): { title: string, message: string } | null => {
    const logs = data.recentLogs || [];
    const state = data.connectorState || {};
    const allText = JSON.stringify(logs) + JSON.stringify(state);

    if (allText.includes('JIRA_INVALID_AUTH_2') || allText.includes('JIRA_INVALID_AUTH')) {
      return {
        title: 'Jira Authentication Error',
        message: 'Verify your Jira API Token. Ensure it is valid and has "read:jira-work" and "read:jira-user" scopes. Check if the user has browsing permissions for the project.'
      };
    }
    if (allText.includes('FORBIDDEN') || allText.includes('403') || allText.includes('PERMISSION_DENIED')) {
      return {
        title: 'Access Denied (403)',
        message: 'The connector lacks permission to access the resource. Check Service Account permissions or 3rd party credentials.'
      };
    }
    if (allText.includes('NOT_FOUND') || allText.includes('404')) {
      return {
        title: 'Resource Not Found (404)',
        message: 'The requested resource (Project, Issue, etc.) could not be found. Check valid IDs and URL configurations.'
      };
    }
    return null;
  };

  const renderContent = () => {
    if (typeof data === 'string') {
      return <div className="whitespace-pre-wrap text-gray-300 font-mono text-sm">{data}</div>;
    }

    // Check if this is our structured diagnostics object
    if (data && data.diagnostics && Array.isArray(data.diagnostics.steps)) {
      const steps = data.diagnostics.steps;
      const warnings = data.diagnostics.warnings || [];
      const errors = data.diagnostics.errors || [];
      const rawOps = data.rawOperations;
      const connectorState = data.connectorState || {};
      const recommendation = getRecommendation(data);

      return (
        <div>
          {/* Tabs */}
          <div className="flex border-b border-gray-700 mb-6">
            <button
              className={`px-4 py-2 text-sm font-medium focus:outline-none transition-colors ${activeTab === 'diagnostics' ? 'text-white border-b-2 border-blue-500' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveTab('diagnostics')}
            >
              Diagnostics
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium focus:outline-none transition-colors ${activeTab === 'verification' ? 'text-white border-b-2 border-blue-500' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveTab('verification')}
            >
              3rd Party Verification
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium focus:outline-none transition-colors ${activeTab === 'config' ? 'text-white border-b-2 border-blue-500' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveTab('config')}
            >
              Configuration
            </button>
          </div>

          {activeTab === 'diagnostics' ? (
            <div className="space-y-6 animate-fadeIn">
              {/* Summary Section */}
              <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
                <h3 className="text-sm font-bold text-gray-300 mb-2 uppercase tracking-wider">Summary</h3>
                <div className={`text-md font-semibold ${status === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                  {data.summary || (status === 'success' ? 'Validation Passed' : 'Validation Failed')}
                </div>

                {recommendation && (
                  <div className="mt-3 bg-blue-900/30 border border-blue-700/50 p-3 rounded flex items-start">
                    <svg className="w-5 h-5 text-blue-400 mr-2 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <div>
                      <div className="text-sm font-bold text-blue-300">{recommendation.title}</div>
                      <div className="text-xs text-blue-200 mt-1">{recommendation.message}</div>
                    </div>
                  </div>
                )}

                {warnings.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {warnings.map((w: string, i: number) => (
                      <div key={i} className="text-xs text-yellow-400 flex items-start">
                        <svg className="h-4 w-4 mr-1 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        {w}
                      </div>
                    ))}
                  </div>
                )}
                {errors.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {errors.map((e: string, i: number) => (
                      <div key={i} className="text-xs text-red-400 flex items-start">
                        <svg className="h-4 w-4 mr-1 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {e}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Steps Table */}
              <div>
                <h3 className="text-sm font-bold text-gray-300 mb-2 uppercase tracking-wider">Diagnostic Steps</h3>
                <div className="overflow-hidden rounded-lg border border-gray-700">
                  <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-800">
                      <tr>
                        <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Step</th>
                        <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                        <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Details</th>
                      </tr>
                    </thead>
                    <tbody className="bg-gray-900 divide-y divide-gray-800">
                      {steps.map((step: any, idx: number) => {
                        const isFail = step.status === 'fail';
                        return (
                          <tr key={idx} className={`${isFail ? 'bg-red-900/20 hover:bg-red-900/30' : 'hover:bg-gray-800/50'} transition-colors`}>
                            <td className={`px-4 py-2 text-sm whitespace-nowrap ${isFail ? 'text-red-300 font-semibold' : 'text-gray-300'}`}>{step.name}</td>
                            <td className="px-4 py-2 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${step.status === 'ok' ? 'bg-green-900/50 text-green-300' :
                                step.status === 'fail' ? 'bg-red-900/60 text-white border border-red-500/50 shadow-sm animate-pulse' :
                                  'bg-blue-900/50 text-blue-300'
                                }`}>
                                {step.status.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-xs font-mono">
                              {isFail ? (
                                <div className="text-red-200 bg-red-950/50 p-2 rounded border border-red-900/50 whitespace-pre-wrap">
                                  {typeof step.details === 'object' ? JSON.stringify(step.details, null, 2) : String(step.details)}
                                </div>
                              ) : (
                                <span className="text-gray-400">
                                  {typeof step.details === 'object' ? JSON.stringify(step.details).substring(0, 100) + (JSON.stringify(step.details).length > 100 ? '...' : '') : String(step.details)}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Raw Data Accordions / Sections */}
              <div className="space-y-2">
                <details className="group">
                  <summary className="flex justify-between items-center font-medium cursor-pointer list-none text-sm text-gray-400 hover:text-white bg-gray-900/30 p-2 rounded">
                    <span>Raw Data Connector State</span>
                    <span className="transition group-open:rotate-180">
                      <svg fill="none" height="24" shapeRendering="geometricPrecision" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="24"><path d="M6 9l6 6 6-6"></path></svg>
                    </span>
                  </summary>
                  <div className="text-gray-300 mt-2 group-open:animate-fadeIn">
                    <pre className="text-xs bg-gray-950 p-2 rounded overflow-x-auto border border-gray-800"
                      dangerouslySetInnerHTML={{
                        __html: escapeHtml(JSON.stringify(data.connectorState, null, 2) || '{}')
                          .replace(/(&quot;state&quot;: &quot;FAILED&quot;)/g, '<span class="text-red-500 font-bold">$1</span>')
                          .replace(/(&quot;error&quot;:\s*\{[^}]+\})/g, '<span class="text-red-400">$1</span>')
                      }}
                    />
                  </div>
                </details>

                {rawOps && rawOps.length > 0 && (
                  <details className="group" open={rawOps.some((op: any) => op.error)}>
                    <summary className="flex justify-between items-center font-medium cursor-pointer list-none text-sm text-gray-400 hover:text-white bg-gray-900/30 p-2 rounded">
                      <span className={rawOps.some((op: any) => op.error) ? "text-red-400 font-bold" : ""}>
                        Recent Operations ({rawOps.length}) {rawOps.some((op: any) => op.error) ? '(Failures Detected)' : ''}
                      </span>
                      <span className="transition group-open:rotate-180">
                        <svg fill="none" height="24" shapeRendering="geometricPrecision" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="24"><path d="M6 9l6 6 6-6"></path></svg>
                      </span>
                    </summary>
                    <div className="text-gray-300 mt-2 group-open:animate-fadeIn">
                      <pre className="text-xs bg-gray-950 p-2 rounded overflow-x-auto border border-gray-800"
                        dangerouslySetInnerHTML={{
                          __html: escapeHtml(JSON.stringify(rawOps, null, 2))
                            .replace(/(&quot;error&quot;:\s*\{[\s\S]*?\}(,|\s*\}))/g, '<span class="text-red-400 font-bold">$1</span>')
                        }}
                      />
                    </div>
                  </details>
                )}

                {data.recentLogs && data.recentLogs.length > 0 && (
                  <details className="group">
                    <summary className="flex justify-between items-center font-medium cursor-pointer list-none text-sm text-gray-400 hover:text-white bg-gray-900/30 p-2 rounded">
                      <span className="text-red-400 font-bold">
                        Recent Error Logs ({data.recentLogs.length})
                      </span>
                      <span className="transition group-open:rotate-180">
                        <svg fill="none" height="24" shapeRendering="geometricPrecision" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="24"><path d="M6 9l6 6 6-6"></path></svg>
                      </span>
                    </summary>
                    <div className="text-gray-300 mt-2 group-open:animate-fadeIn space-y-2">
                      {data.recentLogs.map((log: any, i: number) => (
                        <div key={i} className="bg-gray-950 p-2 rounded border border-gray-800 text-xs font-mono">
                          <div className="flex justify-between text-gray-500 mb-1">
                            <span>{log.timestamp}</span>
                            <span className={log.severity === 'ERROR' ? 'text-red-500' : 'text-yellow-500'}>{log.severity}</span>
                          </div>
                          <div className="whitespace-pre-wrap text-gray-300">
                            {log.textPayload || JSON.stringify(log.jsonPayload || log.protoPayload, null, 2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}



              </div>

            </div>
          ) : activeTab === 'verification' ? (
            <div className="space-y-6 animate-fadeIn">
              <ConnectorVerificationTab connector={data} />
            </div>
          ) : (
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-gray-900/50 p-4 rounded border border-gray-700">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Configuration JSON</h3>
                  {connectorState?.dataSource && ['jira', 'confluence', 'sharepoint', 'onedrive', 'ms-onedrive', 'outlook', 'ms-outlook', 'entraid', 'entra'].includes(connectorState.dataSource) && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          alert(`To get a refresh token for Jira:
1. Enable 'offline_access' scope in Atlassian Developer Console.
2. Visit the authorization URL to get a code.
3. Exchange the code for tokens via curl.

See docs/Connectors_Auth_Guide.md in your workspace for full instructions.`);
                        }}
                        className="px-3 py-1.5 bg-gray-600 text-white text-xs font-semibold rounded hover:bg-gray-700 transition-colors flex items-center gap-1"
                      >
                        Token Help
                      </button>
                      <button
                        onClick={() => {
                          const collectionId = title.split(': ').pop() || 'default_collection';
                          const location = connectorState?.name?.split('/')[3] || 'global';
                          const host = location === 'global' ? 'discoveryengine.googleapis.com' : `${location}-discoveryengine.googleapis.com`;
                          
                          const cleanEntities = connectorState.entities?.map((e: any) => {
                            const { dataStore, ...rest } = e;
                            return rest;
                          }) || [];

                          const dataConnectorTemplate = {
                            dataSource: connectorState.dataSource,
                            params: {
                              ...connectorState.params,
                              client_id: "[YOUR_CLIENT_ID]",
                              client_secret: "[YOUR_CLIENT_SECRET]",
                              refresh_token: (connectorState.dataSource === 'sharepoint' || connectorState.dataSource === 'jira') ? "[YOUR_REFRESH_TOKEN]" : undefined
                            },
                            entities: cleanEntities,
                            refreshInterval: connectorState.refreshInterval,
                            connectorType: connectorState.connectorType,
                            connectorModes: connectorState.connectorModes,
                            actionConfig: connectorState.actionConfig ? {
                              ...connectorState.actionConfig,
                              actionParams: {
                                ...connectorState.actionConfig.actionParams,
                                client_id: "[YOUR_CLIENT_ID]",
                                client_secret: "[YOUR_CLIENT_SECRET]",
                                tenant_id: connectorState.dataSource === 'sharepoint' ? "[YOUR_TENANT_ID]" : undefined,
                                instance_id: connectorState.dataSource === 'jira' ? "[YOUR_INSTANCE_ID]" : undefined
                              }
                            } : undefined,
                            bapConfig: connectorState.bapConfig,
                            destinationConfigs: connectorState.destinationConfigs
                          };

                          const fullPayload = {
                            collectionId: `${collectionId}-clone`,
                            collectionDisplayName: `Cloned ${collectionId}`,
                            dataConnector: dataConnectorTemplate
                          };

                          const curl = `curl -X POST \\
      -H "Authorization: Bearer $(gcloud auth print-access-token)" \\
      -H "Content-Type: application/json" \\
      -H "X-Goog-User-Project: PROJECT_ID" \\
      "https://${host}/v1alpha/projects/PROJECT_ID/locations/${location}:setUpDataConnector" \\
      -d '${JSON.stringify(fullPayload, null, 2).replace(/'/g, "'\\''")}'`;
                          
                          navigator.clipboard.writeText(curl);
                          alert('cURL command copied to clipboard!');
                        }}
                        className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700 transition-colors flex items-center gap-1"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-2M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m-6 9h6m-6 4h6" /></svg>
                        Copy cURL
                      </button>
                    </div>
                  )}
                </div>
                <pre className="text-xs bg-gray-950 p-4 rounded overflow-x-auto border border-gray-800 text-gray-300 font-mono">
                  {JSON.stringify(connectorState, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      );
    }


    // Fallback for generic JSON
    return (
      <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-gray-700 ring-1 ring-white/10">
        <div className={`p-4 border-b ${status === 'success' ? 'border-green-900/50 bg-green-900/10' : 'border-red-900/50 bg-red-900/10'} flex justify-between items-center rounded-t-lg shrink-0`}>
          <h2 className={`text-xl font-bold ${status === 'success' ? 'text-green-400' : 'text-red-400'} flex items-center gap-2`}>
            {status === 'success' ? (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            ) : (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            )}
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-white/5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 custom-scrollbar bg-gray-900">
          {renderContent()}
        </div>

        <div className="p-4 border-t border-gray-700 bg-gray-800 rounded-b-lg shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 text-white font-medium rounded hover:bg-gray-600 transition-colors border border-gray-600 shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConnectorDetailsModal;
