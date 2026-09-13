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

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Agent, AppEngine, Assistant, Config, UserProfile } from '../types';
import * as api from '../services/apiService';
import ProjectInput from '../components/ProjectInput';
import ChatWindow from '../components/agents/ChatWindow';
import CloudConsoleButton from '../components/CloudConsoleButton';
import { useToast } from '../context/ToastContext';
import { usePersistedConfig } from '../hooks/usePersistedConfig';
import {
  useAssistantList,
  AssistantRowData,
} from '../hooks/useAssistantList';
import { AssistantListTable } from '../components/assistants/page/AssistantListTable';
import {
  AssistantDetailView,
  AssistantDetailTab,
} from '../components/assistants/page/AssistantDetailView';

interface AssistantPageProps {
  projectNumber: string;
  projectId?: string;
  setProjectNumber: (projectNumber: string) => void;
  accessToken: string;
  userProfile: UserProfile | null;
  onBuildTriggered?: (buildId: string, projectId?: string) => void;
}

const AssistantPage: React.FC<AssistantPageProps> = ({
  projectNumber,
  projectId,
  setProjectNumber,
  accessToken,
  userProfile,
  onBuildTriggered,
}) => {
  const { toast } = useToast();
  const [config, setConfig] = usePersistedConfig<{ appLocation: string }>(
    'assistantPageConfig',
    { appLocation: 'global' },
    {
      migrate: (parsed) => ({
        appLocation: parsed?.appLocation || 'global',
      }),
    },
  );

  const baseApiConfig: Config = useMemo(
    () => ({
      projectId: projectId || projectNumber,
      appLocation: config.appLocation,
      collectionId: 'default_collection',
      appId: '',
      assistantId: 'default_assistant',
    }),
    [projectNumber, projectId, config],
  );

  const {
    rows,
    setRows,
    sortedRows,
    isListLoading,
    listError,
    searchQuery,
    setSearchQuery,
    page,
    setPage,
    pageSize,
    filteredEngines,
    sortConfig,
    handleSort,
    fetchEngines,
  } = useAssistantList(projectNumber, baseApiConfig);

  // Detail View State
  const [selectedRow, setSelectedRow] = useState<AssistantRowData | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AssistantDetailTab>('overview');
  const [isDataStoreAclSupported, setIsDataStoreAclSupported] = useState<
    boolean | null
  >(() => {
    const override = localStorage.getItem('feature_flag_datastore_acls');
    if (override === 'true') return true;
    if (override === 'false') return false;
    return null;
  });

  // Chat State
  const [activeChatConfig, setActiveChatConfig] = useState<{
    displayName: string;
    config: Config;
  } | null>(null);

  // Probe DataStore ACL feature capability for this project/location
  useEffect(() => {
    if (!selectedRow?.engine) return;
    const override = localStorage.getItem('feature_flag_datastore_acls');
    if (override === 'true') {
      setIsDataStoreAclSupported(true);
      return;
    }
    if (override === 'false') {
      setIsDataStoreAclSupported(false);
      return;
    }

    let isMounted = true;
    const sampleDsId = selectedRow.engine.dataStoreIds?.[0];
    const engineConfig: Config = {
      ...baseApiConfig,
      appId: selectedRow.engine.name.split('/').pop()!,
    };
    api
      .checkDataStoreAclSupport(engineConfig, sampleDsId)
      .then((supported) => {
        if (isMounted) {
          setIsDataStoreAclSupported(supported);
          if (!supported && activeTab === 'datastores') {
            setActiveTab('overview');
          }
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsDataStoreAclSupported(false);
          if (activeTab === 'datastores') {
            setActiveTab('overview');
          }
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedRow?.engine, baseApiConfig, activeTab]);

  const handleConfigChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setConfig((prev) => ({ ...prev, [name]: value }));
    setSelectedRow(null);
  };

  const fetchAgentsForAssistant = useCallback(
    async (appId: string, customAssistantId?: string) => {
      setIsDetailLoading(true);
      const detailConfig = {
        ...baseApiConfig,
        appId,
        ...(customAssistantId ? { assistantId: customAssistantId } : {}),
      };
      try {
        const agentsResponse = await api.listResources('agents', detailConfig);
        const baseAgents = agentsResponse.agents || [];

        if (baseAgents.length > 0) {
          const agentViewPromises = baseAgents.map((agent) =>
            api.getAgentView(agent.name, detailConfig),
          );
          const agentViewResults = await Promise.allSettled(agentViewPromises);

          const enrichedAgents = baseAgents.map((agent, index) => {
            const viewResult = agentViewResults[index];
            const agentType =
              viewResult.status === 'fulfilled' && viewResult.value?.agentView
                ? viewResult.value.agentView.agentType
                : undefined;
            const agentOrigin =
              viewResult.status === 'fulfilled' && viewResult.value?.agentView
                ? viewResult.value.agentView.agentOrigin
                : undefined;
            return {
              ...agent,
              agentType,
              agentOrigin,
            };
          });
          setAgents(enrichedAgents);
        } else {
          setAgents([]);
        }
      } catch (err: any) {
        console.error('Failed to fetch agents for assistant', err);
        toast.error('Failed to load agents for this assistant.');
      } finally {
        setIsDetailLoading(false);
      }
    },
    [baseApiConfig, toast],
  );

  const handleRowClick = (row: AssistantRowData) => {
    if (!row.assistant) {
      toast.warning(
        `This engine (${row.engine.displayName}) has not been fully initialized with an assistant yet. Please open the Assistant configuration or check Discovery Engine status.`,
      );
      return;
    }
    setSelectedRow(row);
    const assistantId = row.assistant.name
      ? row.assistant.name.split('/').pop()
      : undefined;
    fetchAgentsForAssistant(row.engine.name.split('/').pop()!, assistantId);
  };

  const handleChatClick = (row: AssistantRowData, e: React.MouseEvent) => {
    e.stopPropagation();
    const engineId = row.engine.name.split('/').pop()!;
    const assistantId = row.assistant
      ? row.assistant.name.split('/').pop()!
      : 'default_assistant';
    const chatConfig: Config = {
      ...baseApiConfig,
      appId: engineId,
      assistantId: assistantId,
    };
    setActiveChatConfig({
      displayName: row.engine.displayName,
      config: chatConfig,
    });
  };

  const handleBack = () => {
    setSelectedRow(null);
    setAgents([]);
    fetchEngines();
  };

  const handleAssistantUpdateSuccess = (updatedAssistant: Assistant) => {
    if (selectedRow) {
      setSelectedRow({ ...selectedRow, assistant: updatedAssistant });
    }
  };

  const handleEngineUpdateSuccess = (updatedEngine: AppEngine) => {
    if (selectedRow) {
      setSelectedRow({ ...selectedRow, engine: updatedEngine });
    }
    setRows((prev) =>
      prev.map((r) =>
        r.engine.name === updatedEngine.name
          ? { ...r, engine: updatedEngine }
          : r,
      ),
    );
  };

  return (
    <div className="space-y-6 relative">
      {/* Configuration Header */}
      {!selectedRow && (
        <div className="bg-gray-800 p-4 rounded-lg shadow-md border border-gray-700">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-white">
              Project Configuration
            </h2>
            <CloudConsoleButton
              url={`https://console.cloud.google.com/gemini-enterprise/apps?project=${projectNumber}`}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Project ID / Number
              </label>
              <ProjectInput value={projectNumber} onChange={setProjectNumber} />
            </div>
            <div>
              <label
                htmlFor="appLocation"
                className="block text-sm font-medium text-gray-400 mb-1"
              >
                Location
              </label>
              <select
                id="appLocation"
                name="appLocation"
                value={config.appLocation}
                onChange={handleConfigChange}
                className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px] focus:ring-blue-500"
              >
                <option value="global">global</option>
                <option value="us">us</option>
                <option value="eu">eu</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {selectedRow ? (
        <AssistantDetailView
          selectedRow={selectedRow}
          baseApiConfig={baseApiConfig}
          projectNumber={projectNumber}
          userProfile={userProfile}
          isDetailLoading={isDetailLoading}
          agents={agents}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isDataStoreAclSupported={isDataStoreAclSupported}
          isExportModalOpen={isExportModalOpen}
          setIsExportModalOpen={setIsExportModalOpen}
          isAuditModalOpen={isAuditModalOpen}
          setIsAuditModalOpen={setIsAuditModalOpen}
          onBack={handleBack}
          onBuildTriggered={onBuildTriggered}
          onEngineUpdateSuccess={handleEngineUpdateSuccess}
          onAssistantUpdateSuccess={handleAssistantUpdateSuccess}
          onRefreshAgents={() =>
            fetchAgentsForAssistant(
              selectedRow.engine.name.split('/').pop()!,
              selectedRow.assistant
                ? selectedRow.assistant.name.split('/').pop()
                : undefined,
            )
          }
        />
      ) : (
        <AssistantListTable
          sortedRows={sortedRows}
          filteredEngines={filteredEngines}
          page={page}
          pageSize={pageSize}
          setPage={setPage}
          isListLoading={isListLoading}
          listError={listError}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          sortConfig={sortConfig}
          onSort={handleSort}
          onRefresh={fetchEngines}
          onRowClick={handleRowClick}
          onChatClick={handleChatClick}
        />
      )}

      {/* Floating Chat Window */}
      {activeChatConfig && (
        <div className="fixed bottom-4 right-4 z-50 w-[450px] h-[600px] shadow-2xl rounded-lg overflow-hidden border border-gray-700 bg-gray-800 flex flex-col">
          <ChatWindow
            targetDisplayName={activeChatConfig.displayName}
            config={activeChatConfig.config}
            accessToken={accessToken}
            onClose={() => setActiveChatConfig(null)}
            userProfile={userProfile}
          />
        </div>
      )}
    </div>
  );
};

export default AssistantPage;
