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
import { LogEntry, ModelArmorPayload } from '../../types';

export const VerdictBadge: React.FC<{ verdict: string }> = ({ verdict }) => {
  const isBlocked = verdict === 'BLOCKED' || verdict === 'MODEL_ARMOR_SANITIZATION_VERDICT_BLOCK';
  const isAllowed = verdict === 'ALLOWED';

  let colorClass = 'bg-gray-700 text-gray-300 border-gray-600';
  let icon: React.ReactNode = null;

  if (isBlocked) {
    colorClass = 'bg-red-900/50 text-red-200 border-red-800';
    icon = (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
          clipRule="evenodd"
        />
      </svg>
    );
  } else if (isAllowed) {
    colorClass = 'bg-green-900/50 text-green-200 border-green-800';
    icon = (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border flex items-center ${colorClass}`}>
      {icon}
      {verdict}
    </span>
  );
};

export const getTriggeredFilter = (filterResults: any): { name: string; confidence?: string } | null => {
  if (!filterResults) return null;
  for (const filterName in filterResults) {
    const result = filterResults[filterName];
    const filterResultKey = Object.keys(result)[0];
    if (result[filterResultKey]?.matchState === 'MATCH_FOUND') {
      return {
        name: filterName,
        confidence: result[filterResultKey]?.confidenceLevel,
      };
    }
  }
  return null;
};

export const parseAssistantFromCorrelationId = (correlationId: string): string => {
  if (!correlationId || !correlationId.startsWith('AS|')) {
    return 'N/A';
  }
  try {
    const parts = correlationId.split('|');
    if (parts.length > 1 && parts[1].startsWith('projects/')) {
      const path = parts[1];
      const pathParts = path.split('/');
      const assistantIndex = pathParts.indexOf('assistants');
      if (assistantIndex > 0 && assistantIndex < pathParts.length - 1) {
        const engineId = pathParts[assistantIndex - 1];
        const assistantId = pathParts[assistantIndex + 1];
        return `${engineId} / ${assistantId}`;
      }
      return path;
    }
  } catch {
    // Fallthrough
  }
  return 'N/A';
};

export const LogEntryCard: React.FC<{ log: LogEntry }> = ({ log }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const payload = log.jsonPayload as ModelArmorPayload | undefined;
  const sanitizationResult = payload?.sanitizationResult;
  const triggeredFilter = getTriggeredFilter(sanitizationResult?.filterResults);

  const correlationId = log.labels?.['modelarmor.googleapis.com/client_correlation_id'] || '';
  const sourceAssistant = parseAssistantFromCorrelationId(correlationId);

  const verdict = sanitizationResult?.sanitizationVerdict || 'N/A';

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden shadow-sm transition-all hover:border-gray-600">
      {/* Header */}
      <div
        className="p-4 bg-gray-800 border-b border-gray-700/50 flex flex-col sm:flex-row justify-between sm:items-center gap-2 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-gray-400 bg-gray-900 px-2 py-1 rounded border border-gray-700">
            {log.receiveTimestamp ? new Date(log.receiveTimestamp).toLocaleString() : 'N/A'}
          </span>
          <span className="text-sm font-medium text-white" title={correlationId}>
            {sourceAssistant}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <VerdictBadge verdict={verdict} />
          <button className="text-gray-500 hover:text-white transition-colors" aria-label="Toggle log details">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {/* Triggered Filter Info */}
          {triggeredFilter && (
            <div className="bg-red-900/10 border border-red-900/30 rounded-md p-3">
              <p className="text-xs font-bold text-red-300 uppercase mb-1">Triggered Filter</p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white font-medium">{triggeredFilter.name}</span>
                {triggeredFilter.confidence && (
                  <span className="text-xs text-red-200 bg-red-900/40 px-2 py-0.5 rounded">
                    Confidence: {triggeredFilter.confidence}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Explanation */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase mb-1">Reason</p>
            <p className="text-sm text-gray-300 bg-gray-900/50 p-2 rounded border border-gray-700/50">
              {sanitizationResult?.sanitizationVerdictReason || 'No detailed reason provided.'}
            </p>
          </div>
        </div>

        <div className="lg:col-span-1">
          <p className="text-xs font-bold text-gray-500 uppercase mb-1">Sanitized Input</p>
          <div className="bg-gray-900 p-3 rounded-md border border-gray-700/50 max-h-32 overflow-y-auto text-sm text-gray-300 font-mono whitespace-pre-wrap break-all">
            {payload?.sanitizationInput?.text || <span className="text-gray-600 italic">No input text available</span>}
          </div>
        </div>
      </div>

      {/* JSON Expandable */}
      {isExpanded && (
        <div className="bg-black p-4 border-t border-gray-700">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-xs font-bold text-gray-500 uppercase">Raw Log Payload</h4>
            <button
              className="text-xs text-blue-400 hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                void navigator.clipboard.writeText(JSON.stringify(log.jsonPayload, null, 2));
              }}
            >
              Copy JSON
            </button>
          </div>
          <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all overflow-x-auto max-h-96">
            {JSON.stringify(log.jsonPayload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
