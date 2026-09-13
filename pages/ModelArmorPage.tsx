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

import React, { useState, useMemo, useCallback } from 'react';
import { Config, LogEntry } from '../types';
import * as api from '../services/apiService';
import { toErrorMessage } from '../utils/errors';
import CloudConsoleButton from '../components/CloudConsoleButton';
import { useModelArmorPolicies } from '../hooks/useModelArmorPolicies';
import { SanitizationAuditTab } from '../components/model-armor/SanitizationAuditTab';
import { ActivePoliciesViewer } from '../components/model-armor/ActivePoliciesViewer';
import { AttachedProtectionPanel } from '../components/model-armor/AttachedProtectionPanel';
import { PolicyGenerator } from '../components/model-armor/PolicyGenerator';
import { CloneTemplateModal } from '../components/model-armor/CloneTemplateModal';

const ShieldIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6 text-blue-400"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
    />
  </svg>
);

export interface ModelArmorPageProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
}

const ModelArmorPage: React.FC<ModelArmorPageProps> = ({ projectNumber }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [filterBlockedOnly, setFilterBlockedOnly] = useState(false);
  const [daysFilter, setDaysFilter] = useState(7);
  const [activeTab, setActiveTab] = useState<'logs' | 'policies'>('logs');

  const policyState = useModelArmorPolicies(projectNumber, activeTab);

  const apiConfig: Omit<Config, 'accessToken'> = useMemo(
    () => ({
      projectId: projectNumber,
      appLocation: 'global',
      collectionId: 'default_collection',
      appId: '',
      assistantId: '',
    }),
    [projectNumber]
  );

  const handleFetchLogs = useCallback(async () => {
    if (!projectNumber) {
      setError('Project ID is required to fetch logs.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setLogs([]);

    const filters: string[] = [];
    if (filterBlockedOnly) {
      filters.push(
        '(jsonPayload.sanitizationResult.sanitizationVerdict="BLOCKED" OR jsonPayload.sanitizationResult.sanitizationVerdict="MODEL_ARMOR_SANITIZATION_VERDICT_BLOCK")'
      );
    }
    if (filterText.trim()) {
      filters.push(`(${filterText.trim()})`);
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysFilter);
    filters.push(`timestamp >= "${cutoffDate.toISOString()}"`);

    const combinedCustomFilter = filters.join(' AND ');

    try {
      const response = await api.fetchViolationLogs(apiConfig, combinedCustomFilter);
      setLogs(response.entries || []);
    } catch (err: unknown) {
      setError(toErrorMessage(err, 'Failed to fetch violation logs.'));
    } finally {
      setIsLoading(false);
    }
  }, [apiConfig, filterText, projectNumber, filterBlockedOnly, daysFilter]);

  const cloudConsoleUrl = useMemo(() => {
    const filters = [`resource.type="modelarmor.googleapis.com/SanitizeOperation"`];
    if (filterBlockedOnly) {
      filters.push(
        '(jsonPayload.sanitizationResult.sanitizationVerdict="BLOCKED" OR jsonPayload.sanitizationResult.sanitizationVerdict="MODEL_ARMOR_SANITIZATION_VERDICT_BLOCK")'
      );
    }
    if (filterText.trim()) {
      filters.push(`(${filterText.trim()})`);
    }

    const combinedQuery = filters.join('\n');
    const encodedQuery = encodeURIComponent(combinedQuery);
    const durationStr = `P${daysFilter}D`;

    return `https://console.cloud.google.com/logs/query;query=${encodedQuery};duration=${durationStr}?referrer=search&project=${projectNumber}`;
  }, [filterBlockedOnly, filterText, daysFilter, projectNumber]);

  return (
    <div className="space-y-4">
      {/* Header & Main Controls */}
      <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 border-b border-gray-700 pb-4">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <ShieldIcon />
                Model Armor Manager
              </h2>
              <p className="text-sm text-gray-400 mt-1">
                Monitor content safety violations and configure protection policies.
              </p>
            </div>
          </div>
          <div className="w-full md:w-auto">
            <CloudConsoleButton url={cloudConsoleUrl} />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 mb-4">
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'logs'
                ? 'text-blue-400 border-blue-400'
                : 'text-gray-400 border-transparent hover:text-white hover:border-gray-600'
            }`}
          >
            Activity Logs
          </button>
          <button
            onClick={() => setActiveTab('policies')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'policies'
                ? 'text-blue-400 border-blue-400'
                : 'text-gray-400 border-transparent hover:text-white hover:border-gray-600'
            }`}
          >
            Policy Configuration
          </button>
        </div>

        {/* Filters Row (Only for Logs) */}
        {activeTab === 'logs' && (
          <SanitizationAuditTab
            projectNumber={projectNumber}
            logs={logs}
            isLoading={isLoading}
            error={error}
            filterText={filterText}
            setFilterText={setFilterText}
            filterBlockedOnly={filterBlockedOnly}
            setFilterBlockedOnly={setFilterBlockedOnly}
            daysFilter={daysFilter}
            setDaysFilter={setDaysFilter}
            handleFetchLogs={handleFetchLogs}
          />
        )}
      </div>

      {/* Policies View */}
      {activeTab === 'policies' && (
        <div className="space-y-6 animate-fade-in-up">
          <ActivePoliciesViewer
            templates={policyState.templates}
            associations={policyState.associations}
            associationsComplete={policyState.associationsComplete}
            scanWarnings={policyState.scanWarnings}
            isLoading={policyState.isPoliciesLoading}
            error={policyState.policiesError}
            onRefresh={policyState.fetchPoliciesAndAssociations}
            onClone={policyState.setCloningTemplate}
          />
          <AttachedProtectionPanel
            engines={policyState.enginesList}
            isLoading={policyState.isPoliciesLoading}
          />
          <PolicyGenerator
            projectId={projectNumber || '[YOUR_PROJECT_ID]'}
            engines={policyState.enginesList}
            onRefresh={policyState.fetchPoliciesAndAssociations}
          />
          {policyState.cloningTemplate && (
            <CloneTemplateModal
              template={policyState.cloningTemplate}
              currentProjectId={projectNumber || ''}
              onClose={() => policyState.setCloningTemplate(null)}
              onSuccess={() => {
                policyState.setCloningTemplate(null);
                policyState.fetchPoliciesAndAssociations();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default ModelArmorPage;
