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
import { Config, LogEntry, Page } from '../types';
import * as api from '../services/apiService';
import { toErrorMessage } from '../utils/errors';
import PageShell from '../components/layout/PageShell';
import PageHeader from '../components/layout/PageHeader';
import { Tabs } from '../components/common/Tabs';
import { useModelArmorPolicies } from '../hooks/useModelArmorPolicies';
import { SanitizationAuditTab } from '../components/model-armor/SanitizationAuditTab';
import { ActivePoliciesViewer } from '../components/model-armor/ActivePoliciesViewer';
import { AttachedProtectionPanel } from '../components/model-armor/AttachedProtectionPanel';
import { PolicyGenerator } from '../components/model-armor/PolicyGenerator';
import { CloneTemplateModal } from '../components/model-armor/CloneTemplateModal';
import { FloorSettingsAndSanitizeTester } from '../components/model-armor/FloorSettingsAndSanitizeTester';

const ShieldIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-5 w-5"
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
  projectId?: string;
  setProjectNumber: (projectNumber: string) => void;
}

const ModelArmorPage: React.FC<ModelArmorPageProps> = ({ projectNumber, projectId }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [filterBlockedOnly, setFilterBlockedOnly] = useState(false);
  const [filterExclusionsOnly, setFilterExclusionsOnly] = useState(false);
  const [daysFilter, setDaysFilter] = useState(7);
  const [activeTab, setActiveTab] = useState<'logs' | 'policies' | 'floor_and_tester'>('logs');

  const policyState = useModelArmorPolicies(
    projectNumber,
    activeTab === 'logs' ? 'logs' : 'policies',
  );

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
    if (filterExclusionsOnly) {
      filters.push(
        '(labels."modelarmor.googleapis.com/exclusion_rule_overridden_filters":* OR labels."modelarmor.googleapis.com/exclusion_rule_skipped_filters":*)'
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
  }, [apiConfig, filterText, projectNumber, filterBlockedOnly, filterExclusionsOnly, daysFilter]);

  const cloudConsoleUrl = useMemo(() => {
    const filters = [`resource.type="modelarmor.googleapis.com/SanitizeOperation"`];
    if (filterBlockedOnly) {
      filters.push(
        '(jsonPayload.sanitizationResult.sanitizationVerdict="BLOCKED" OR jsonPayload.sanitizationResult.sanitizationVerdict="MODEL_ARMOR_SANITIZATION_VERDICT_BLOCK")'
      );
    }
    if (filterExclusionsOnly) {
      filters.push(
        '(labels."modelarmor.googleapis.com/exclusion_rule_overridden_filters":* OR labels."modelarmor.googleapis.com/exclusion_rule_skipped_filters":*)'
      );
    }
    if (filterText.trim()) {
      filters.push(`(${filterText.trim()})`);
    }

    const combinedQuery = filters.join('\n');
    const encodedQuery = encodeURIComponent(combinedQuery);
    const durationStr = `P${daysFilter}D`;

    return `https://console.cloud.google.com/logs/query;query=${encodedQuery};duration=${durationStr}?referrer=search&project=${projectNumber}`;
  }, [filterBlockedOnly, filterExclusionsOnly, filterText, daysFilter, projectNumber]);

  return (
    <PageShell variant="wide">
      <PageHeader
        title="Model Armor"
        subtitle="Configure prompt-injection shields, PII/SDP guardrails, floor settings, and live sanitization probes."
        icon={<ShieldIcon />}
        consolePage={Page.MODEL_ARMOR}
        projectId={projectId}
        projectNumber={projectNumber}
        secondaryActions={
          activeTab === 'logs' ? (
            <a
              href={cloudConsoleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs sm:text-sm font-medium text-gray-200 hover:text-white transition-colors"
            >
              <span>Logs Explorer</span>
            </a>
          ) : undefined
        }
      />

      <Tabs
        syncSearchParam="tab"
        ariaLabel="Model Armor Sections"
        activeTab={activeTab}
        onChange={setActiveTab}
        items={[
          { id: 'logs', label: 'Activity Logs' },
          { id: 'policies', label: 'Policy Configuration' },
          { id: 'floor_and_tester', label: 'Floor Settings & Live Tester' },
        ]}
      />

      {/* Activity Logs View */}
      {activeTab === 'logs' && (
        <div
          data-testid="model-armor-logs-panel"
          className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-sm space-y-4"
        >
          <SanitizationAuditTab
            projectNumber={projectNumber}
            logs={logs}
            isLoading={isLoading}
            error={error}
            filterText={filterText}
            setFilterText={setFilterText}
            filterBlockedOnly={filterBlockedOnly}
            setFilterBlockedOnly={setFilterBlockedOnly}
            filterExclusionsOnly={filterExclusionsOnly}
            setFilterExclusionsOnly={setFilterExclusionsOnly}
            daysFilter={daysFilter}
            setDaysFilter={setDaysFilter}
            handleFetchLogs={handleFetchLogs}
            templates={policyState.templates}
            enginesList={policyState.enginesList}
            isPoliciesLoading={policyState.isPoliciesLoading}
            onRequestPolicies={policyState.fetchPoliciesAndAssociations}
            onPolicyUpdated={policyState.fetchPoliciesAndAssociations}
          />
        </div>
      )}

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
            projectId={projectId || projectNumber || '[YOUR_PROJECT_ID]'}
            engines={policyState.enginesList}
            onRefresh={policyState.fetchPoliciesAndAssociations}
          />
          {policyState.cloningTemplate && (
            <CloneTemplateModal
              template={policyState.cloningTemplate}
              currentProjectId={projectId || projectNumber || ''}
              onClose={() => policyState.setCloningTemplate(null)}
              onSuccess={() => {
                policyState.setCloningTemplate(null);
                policyState.fetchPoliciesAndAssociations();
              }}
            />
          )}
        </div>
      )}

      {/* Floor Settings & Live Sanitize Tester View */}
      {activeTab === 'floor_and_tester' && (
        <div className="animate-fade-in-up">
          <FloorSettingsAndSanitizeTester
            projectId={projectId || projectNumber}
            templates={policyState.templates}
            onRefreshTemplates={policyState.fetchPoliciesAndAssociations}
          />
        </div>
      )}
    </PageShell>
  );
};

export default ModelArmorPage;
