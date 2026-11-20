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
import { Agent, AppEngine, Assistant, Config, UserProfile } from '../../../types';
import { AssistantRowData } from '../../../hooks/useAssistantList';
import { Tabs, TabItem } from '../../common/Tabs';
import Spinner from '../../Spinner';
import AssistantDetailsForm from '../AssistantDetailsForm';
import EngineDetailsForm from '../EngineDetailsForm';
import AgentListForAssistant from '../AgentListForAssistant';
import ExportMetricsModal from '../ExportMetricsModal';
import AuditLoggingModal from '../AuditLoggingModal';
import AssistantEvaluationModal from '../AssistantEvaluationModal';
import ChatHistoryViewer from '../ChatHistoryViewer';
import NotebookListViewer from '../NotebookListViewer';
import VanityUrlDeploymentForm from '../VanityUrlDeploymentForm';
import ProvisionedRedirectList from '../vanity/ProvisionedRedirectList';
import ConnectedDataStorePermissions from '../ConnectedDataStorePermissions';
import UserMemoriesViewer from '../UserMemoriesViewer';
import SkillsViewer from '../SkillsViewer';
import { useProjectEnrollment } from '../../../context/ProjectEnrollmentContext';

export type AssistantDetailTab =
  | 'overview'
  | 'agents'
  | 'skills'
  | 'memories'
  | 'datastores'
  | 'notebooks'
  | 'history'
  | 'customize';

interface AssistantDetailViewProps {
  selectedRow: AssistantRowData;
  baseApiConfig: Config;
  projectNumber: string;
  userProfile: UserProfile | null;
  isDetailLoading: boolean;
  agents: Agent[];
  activeTab: AssistantDetailTab;
  setActiveTab: (tab: AssistantDetailTab) => void;
  isDataStoreAclSupported: boolean | null;
  isExportModalOpen: boolean;
  setIsExportModalOpen: (open: boolean) => void;
  isAuditModalOpen: boolean;
  setIsAuditModalOpen: (open: boolean) => void;
  isEvaluateModalOpen?: boolean;
  setIsEvaluateModalOpen?: (open: boolean) => void;
  onBack: () => void;
  onBuildTriggered?: (buildId: string, projectId?: string) => void;
  onEngineUpdateSuccess: (engine: AppEngine) => void;
  onAssistantUpdateSuccess: (assistant: Assistant) => void;
  onRefreshAgents: () => void;
  onOpenLatencyLab?: () => void;
  onOpenPlayground?: () => void;
}

export const AssistantDetailView: React.FC<AssistantDetailViewProps> = ({
  selectedRow,
  baseApiConfig,
  projectNumber,
  userProfile,
  isDetailLoading,
  agents,
  activeTab,
  setActiveTab,
  isDataStoreAclSupported,
  isExportModalOpen,
  setIsExportModalOpen,
  isAuditModalOpen,
  setIsAuditModalOpen,
  isEvaluateModalOpen: externalIsEvaluateOpen,
  setIsEvaluateModalOpen: externalSetIsEvaluateOpen,
  onBack,
  onBuildTriggered,
  onEngineUpdateSuccess,
  onAssistantUpdateSuccess,
  onRefreshAgents,
  onOpenLatencyLab,
  onOpenPlayground,
}) => {
  // Declared before the early return below so hook order stays stable.
  const [redirectRefreshToken, setRedirectRefreshToken] = useState(0);
  const [internalIsEvaluateOpen, setInternalIsEvaluateOpen] = useState(false);
  const { isGoogleInternal } = useProjectEnrollment();

  const isEvaluateModalOpen = externalIsEvaluateOpen ?? internalIsEvaluateOpen;
  const setIsEvaluateModalOpen =
    externalSetIsEvaluateOpen ?? setInternalIsEvaluateOpen;

  const currentConfig = useMemo<Config>(
    () => ({
      ...baseApiConfig,
      appId: selectedRow.engine.name.split('/').pop()!,
      assistantId: selectedRow.assistant?.name
        ? selectedRow.assistant.name.split('/').pop()!
        : 'default_assistant',
      engineName: selectedRow.engine.name,
      projectNumber: projectNumber,
    }),
    [
      baseApiConfig,
      selectedRow.engine.name,
      selectedRow.assistant?.name,
      projectNumber,
    ],
  );

  const tabItems = useMemo<readonly TabItem<AssistantDetailTab>[]>(
    () => [
      { id: 'overview', label: 'Overview' },
      { id: 'agents', label: 'Agents' },
      { id: 'skills', label: 'Skills', badge: 'Capabilities' },
      ...(isGoogleInternal
        ? [
            {
              id: 'memories' as const,
              label: 'User Memories',
              badge: 'Internal',
            },
          ]
        : []),
      {
        id: 'datastores',
        label: 'Connected DataStores',
        badge: 'Beta',
      },
      { id: 'notebooks', label: 'Notebooks' },
      { id: 'history', label: 'History' },
      { id: 'customize', label: 'Domains & Vanity URLs' },
    ],
    [isGoogleInternal],
  );

  if (!selectedRow.assistant) return null;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-900/85 p-4 rounded-xl shadow-md border border-gray-800/90">
        <div className="flex items-center gap-3.5 min-w-0">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to Engines"
            title="Back to Engines"
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs sm:text-sm font-medium text-gray-200 hover:text-white transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span aria-hidden="true">←</span>
            <span>Back to Engines</span>
          </button>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-white truncate">
              {selectedRow.engine.displayName}
            </h2>
            <p className="text-sm text-gray-400 font-mono truncate">
              {currentConfig.appId}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {onOpenPlayground && (
            <button
              type="button"
              onClick={onOpenPlayground}
              className="px-3.5 h-9 bg-emerald-600 text-white text-xs sm:text-sm font-semibold rounded-lg hover:bg-emerald-500 shadow-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 shrink-0"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Open Playground</span>
            </button>
          )}
          {onOpenLatencyLab && (
            <button
              type="button"
              onClick={onOpenLatencyLab}
              className="px-3.5 h-9 bg-indigo-600 text-white text-xs sm:text-sm font-semibold rounded-lg hover:bg-indigo-500 shadow-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 shrink-0"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Latency Lab</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsEvaluateModalOpen(true)}
            className="px-3.5 h-9 bg-purple-600 text-white text-xs sm:text-sm font-semibold rounded-lg hover:bg-purple-500 shadow-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
            <span>Evaluate Config</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-400/20 text-amber-200 border border-amber-300/40">
              Experimental
            </span>
          </button>
          <button
            type="button"
            onClick={() => setIsAuditModalOpen(true)}
            className="px-3.5 h-9 bg-blue-600 text-white text-xs sm:text-sm font-semibold rounded-lg hover:bg-blue-500 shadow-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 shrink-0"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span>Backup Usage Logging</span>
          </button>
          <button
            type="button"
            onClick={() => setIsExportModalOpen(true)}
            className="px-3.5 h-9 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 hover:text-white text-xs sm:text-sm font-semibold rounded-lg shadow-xs whitespace-nowrap shrink-0 transition-colors"
          >
            Backup Analytics
          </button>
        </div>
      </div>

      {isDetailLoading ? (
        <Spinner />
      ) : (
        <div className="space-y-6">
          {/* Canonical WAI-ARIA Tabs Navigation */}
          <Tabs
            ariaLabel="Engine and Assistant Configuration"
            syncSearchParam="tab"
            activeTab={activeTab}
            onChange={setActiveTab}
            items={tabItems}
          />

          {/* Tab Content */}
          <div className="py-4">
            {activeTab === 'overview' && (
              <>
                <EngineDetailsForm
                  engine={selectedRow.engine}
                  config={currentConfig}
                  onUpdateSuccess={onEngineUpdateSuccess}
                  onLaunchWizard={() => setIsAuditModalOpen(true)}
                  onNavigateToDataStores={() => setActiveTab('datastores')}
                  isDataStoreAclSupported={isDataStoreAclSupported}
                />
                <div className="mt-6">
                  <AssistantDetailsForm
                    assistant={selectedRow.assistant}
                    config={currentConfig}
                    onUpdateSuccess={onAssistantUpdateSuccess}
                  />
                </div>
              </>
            )}

            {activeTab === 'agents' && (
              <AgentListForAssistant
                agents={agents}
                config={currentConfig}
                engine={selectedRow.engine}
                onRefreshAgents={onRefreshAgents}
              />
            )}

            {activeTab === 'skills' && (
              <SkillsViewer
                agents={agents}
                config={currentConfig}
                engine={selectedRow.engine}
                userProfile={userProfile}
                onRefreshSkills={onRefreshAgents}
              />
            )}

            {activeTab === 'memories' && isGoogleInternal && (
              <UserMemoriesViewer
                config={currentConfig}
                userProfile={userProfile}
              />
            )}

            {activeTab === 'datastores' && (
              <ConnectedDataStorePermissions
                engine={selectedRow.engine}
                config={currentConfig}
                projectNumber={projectNumber}
                currentUserEmail={userProfile?.email}
              />
            )}

            {activeTab === 'notebooks' && (
              <NotebookListViewer config={currentConfig} />
            )}

            {activeTab === 'history' && (
              <ChatHistoryViewer config={currentConfig} />
            )}

            {activeTab === 'customize' && (
              <div className="space-y-6">
                {/* Teardown lives next to provisioning: deploying a load
                    balancer the operator cannot remove leaves billed Google
                    Cloud resources stranded. */}
                <ProvisionedRedirectList
                  engine={selectedRow.engine}
                  projectId={currentConfig.projectId}
                  onBuildTriggered={onBuildTriggered}
                  refreshToken={redirectRefreshToken}
                />
                <VanityUrlDeploymentForm
                  engine={selectedRow.engine}
                  config={currentConfig}
                  projectNumber={projectNumber}
                  onBuildTriggered={(buildId, buildProjectId) => {
                    setRedirectRefreshToken((v) => v + 1);
                    onBuildTriggered?.(buildId, buildProjectId);
                  }}
                />
              </div>
            )}
          </div>

          <ExportMetricsModal
            isOpen={isExportModalOpen}
            onClose={() => setIsExportModalOpen(false)}
            config={currentConfig}
            onBuildTriggered={onBuildTriggered}
            projectNumber={projectNumber}
          />

          <AuditLoggingModal
            isOpen={isAuditModalOpen}
            onClose={() => setIsAuditModalOpen(false)}
            config={currentConfig}
            engine={selectedRow.engine}
            onUpdateSuccess={onEngineUpdateSuccess}
            projectNumber={projectNumber}
          />
        </div>
      )}

      <AssistantEvaluationModal
        isOpen={isEvaluateModalOpen}
        onClose={() => setIsEvaluateModalOpen(false)}
        engine={selectedRow.engine}
        assistant={selectedRow.assistant}
        agents={agents}
        config={currentConfig}
        onNavigateToTab={(tab) => setActiveTab(tab)}
        onRefreshAgents={onRefreshAgents}
        onOpenLatencyLab={
          onOpenLatencyLab
            ? () => {
                setIsEvaluateModalOpen(false);
                onOpenLatencyLab();
              }
            : undefined
        }
      />
    </div>
  );
};
