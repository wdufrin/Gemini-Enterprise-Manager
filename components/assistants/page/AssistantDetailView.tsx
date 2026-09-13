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
import { Agent, AppEngine, Assistant, Config, UserProfile } from '../../../types';
import { AssistantRowData } from '../../../hooks/useAssistantList';
import Spinner from '../../Spinner';
import AssistantDetailsForm from '../AssistantDetailsForm';
import EngineDetailsForm from '../EngineDetailsForm';
import AgentListForAssistant from '../AgentListForAssistant';
import ExportMetricsModal from '../ExportMetricsModal';
import AuditLoggingModal from '../AuditLoggingModal';
import ChatHistoryViewer from '../ChatHistoryViewer';
import NotebookListViewer from '../NotebookListViewer';
import VanityUrlDeploymentForm from '../VanityUrlDeploymentForm';
import ConnectedDataStorePermissions from '../ConnectedDataStorePermissions';
import UserMemoriesViewer from '../UserMemoriesViewer';
import SkillsViewer from '../SkillsViewer';

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
  onBack: () => void;
  onBuildTriggered?: (buildId: string, projectId?: string) => void;
  onEngineUpdateSuccess: (engine: AppEngine) => void;
  onAssistantUpdateSuccess: (assistant: Assistant) => void;
  onRefreshAgents: () => void;
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
  onBack,
  onBuildTriggered,
  onEngineUpdateSuccess,
  onAssistantUpdateSuccess,
  onRefreshAgents,
}) => {
  if (!selectedRow.assistant) return null;

  const currentConfig = {
    ...baseApiConfig,
    appId: selectedRow.engine.name.split('/').pop()!,
    assistantId: selectedRow.assistant
      ? selectedRow.assistant.name.split('/').pop()!
      : 'default_assistant',
    engineName: selectedRow.engine.name,
    projectNumber: projectNumber,
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between bg-gray-800 p-4 rounded-lg shadow-md border border-gray-700">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <div>
            <h2 className="text-xl font-bold text-white">
              {selectedRow.engine.displayName}
            </h2>
            <p className="text-sm text-gray-400 font-mono">
              {currentConfig.appId}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsAuditModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 shadow-md flex items-center gap-1"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                clipRule="evenodd"
              />
            </svg>
            Backup Usage Logging
          </button>
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 shadow-md"
          >
            Backup Analytics
          </button>
        </div>
      </div>

      {isDetailLoading ? (
        <Spinner />
      ) : (
        <div className="space-y-6">
          {/* Tabs Navigation */}
          <div className="border-b border-gray-700 flex justify-between items-center">
            <nav className="-mb-px flex space-x-8" aria-label="Tabs">
              {[
                { key: 'overview', label: 'Overview' },
                { key: 'agents', label: 'Agents' },
                { key: 'skills', label: 'Skills', badge: 'Capabilities' },
                {
                  key: 'memories',
                  label: 'User Memories',
                  badge: 'Personalization',
                },
                ...(isDataStoreAclSupported
                  ? [
                      {
                        key: 'datastores',
                        label: 'Connected DataStores',
                        badge: 'Beta',
                      },
                    ]
                  : []),
                { key: 'notebooks', label: 'Notebooks' },
                { key: 'history', label: 'History' },
                { key: 'customize', label: 'Customize' },
              ].map((tabItem) => (
                <button
                  key={tabItem.key}
                  onClick={() => setActiveTab(tabItem.key as AssistantDetailTab)}
                  className={`${
                    activeTab === tabItem.key
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm capitalize flex items-center gap-1.5`}
                >
                  <span>{tabItem.label}</span>
                  {tabItem.badge && (
                    <span className="px-1.5 py-0.2 bg-purple-900/60 text-purple-300 text-[10px] font-bold rounded-full border border-purple-600">
                      {tabItem.badge}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

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
                onRefreshAgents={onRefreshAgents}
              />
            )}

            {activeTab === 'skills' && (
              <SkillsViewer
                agents={agents}
                config={currentConfig}
                userProfile={userProfile}
                onRefreshSkills={onRefreshAgents}
              />
            )}

            {activeTab === 'memories' && (
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
              />
            )}

            {activeTab === 'notebooks' && (
              <NotebookListViewer config={currentConfig} />
            )}

            {activeTab === 'history' && (
              <ChatHistoryViewer config={currentConfig} />
            )}

            {activeTab === 'customize' && (
              <VanityUrlDeploymentForm
                engine={selectedRow.engine}
                config={currentConfig}
                projectNumber={projectNumber}
                onBuildTriggered={onBuildTriggered}
              />
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
    </div>
  );
};
