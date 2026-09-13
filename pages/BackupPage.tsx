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
import { validateBackupSchema } from '../components/backup/backupSchemaValidator';
import BackupRestoreCard from '../components/backup/BackupRestoreCard';
import BackupConfigHeader from '../components/backup/BackupConfigHeader';
import BackupLogConsole from '../components/backup/BackupLogConsole';
import BackupModals from '../components/backup/BackupModals';
import { useBackupOperations } from '../hooks/useBackupOperations';
import type { RestoreProcessor } from '../hooks/useBackupOperations';

// Re-export validateBackupSchema for backward compatibility and tests
export { validateBackupSchema };

export interface BackupPageProps {
  accessToken: string;
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
}

const BackupPage: React.FC<BackupPageProps> = ({
  accessToken,
  projectNumber,
  setProjectNumber,
}) => {
  const ops = useBackupOperations({
    accessToken,
    projectNumber,
    setProjectNumber,
  });

  const cardConfigs: Array<{
    section: string;
    title: string;
    scope: 'Global' | 'User Specific';
    backupHandler: () => Promise<void>;
    restoreProcessor: RestoreProcessor;
  }> = [
    {
      section: 'DiscoveryResources',
      title: 'All Discovery Resources',
      scope: 'Global',
      backupHandler: ops.handleBackupDiscovery,
      restoreProcessor: ops.processRestoreDiscovery,
    },
    {
      section: 'ReasoningEngine',
      title: 'Single Agent Engine',
      scope: 'Global',
      backupHandler: ops.handleBackupReasoningEngine,
      restoreProcessor: ops.processRestoreReasoningEngine,
    },
    {
      section: 'Assistant',
      title: 'Single Assistant',
      scope: 'Global',
      backupHandler: ops.handleBackupAssistant,
      restoreProcessor: ops.processRestoreAssistant,
    },
    {
      section: 'Agents',
      title: 'Agents',
      scope: 'Global',
      backupHandler: ops.handleBackupAgents,
      restoreProcessor: ops.processRestoreAgents,
    },
    {
      section: 'DataStores',
      title: 'Data Stores',
      scope: 'Global',
      backupHandler: ops.handleBackupDataStores,
      restoreProcessor: ops.processRestoreDataStores,
    },
    {
      section: 'Authorizations',
      title: 'Authorizations',
      scope: 'Global',
      backupHandler: ops.handleBackupAuthorizations,
      restoreProcessor: ops.processRestoreAuthorizations,
    },
    {
      section: 'NotebookLM',
      title: 'NotebookLMs',
      scope: 'User Specific',
      backupHandler: ops.handleBackupNotebooks,
      restoreProcessor: ops.processRestoreNotebooks,
    },
    {
      section: 'ChatHistory',
      title: 'Chat History',
      scope: 'User Specific',
      backupHandler: ops.handleBackupChatHistory,
      restoreProcessor: async () => {
        /* Handled by handleRestore special case */
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Modals */}
      <BackupModals
        chatHistoryArchiveData={ops.chatHistoryArchiveData}
        onCloseChatHistory={() => ops.setChatHistoryArchiveData(null)}
        apiConfig={ops.apiConfig}
        modalData={ops.modalData}
        onCloseModalData={() => ops.setModalData(null)}
        onConfirmModalData={(selectedItems) => {
          if (ops.modalData) {
            ops.handleConfirmRestore(
              ops.modalData.section,
              selectedItems,
              ops.modalData.processor,
              ops.modalData.originalData
            );
          }
        }}
        isLoading={ops.isLoading}
        secretPrompt={ops.secretPrompt}
        onSecretSubmit={ops.handleSecretSubmit}
        onSecretClose={ops.handleSecretClose}
        infoModalKey={ops.infoModalKey}
        onCloseInfoModal={() => ops.setInfoModalKey(null)}
        backupToDelete={ops.backupToDelete}
        onCloseDeleteBackup={() => ops.setBackupToDelete(null)}
        onConfirmDeleteBackup={ops.confirmDeleteBackup}
        selectedBucket={ops.selectedBucket}
        restoreConfirmData={ops.restoreConfirmData}
        onCloseRestoreConfirm={() => ops.setRestoreConfirmData(null)}
        onExecuteRestoreConfirm={ops.executeConfirmedRestore}
      />

      {/* Configuration Header */}
      <BackupConfigHeader
        projectNumber={projectNumber}
        onProjectNumberChange={ops.handleProjectNumberChange}
        config={ops.config}
        onConfigChange={ops.handleConfigChange}
        apps={ops.apps}
        isLoadingApps={ops.isLoadingApps}
        reasoningEngines={ops.reasoningEngines}
        isLoadingReasoningEngines={ops.isLoadingReasoningEngines}
        buckets={ops.buckets}
        selectedBucket={ops.selectedBucket}
        onBucketChange={ops.setSelectedBucket}
        isLoadingBuckets={ops.isLoadingBuckets}
      />

      {/* Metadata Scope Notice Banner */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white text-center">
          Backup & Restore Actions (GCS)
        </h2>
        <p className="text-center text-gray-400 text-sm -mt-2">
          Backups are stored in <strong>gs://{ops.selectedBucket || '...'}</strong>. Select a file
          from the dropdown to restore.
        </p>
        <div className="bg-amber-950/30 border border-amber-800/60 rounded-lg p-3 text-xs text-amber-200 flex items-start gap-2.5 max-w-4xl mx-auto">
          <svg
            className="w-5 h-5 text-amber-400 shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div>
            <span className="font-semibold text-amber-300">Metadata Scope Notice:</span> Backups
            store configuration schemas, settings, and authorization metadata. Data Store backups do
            not bundle indexed document blobs or raw connector payloads — upon restoration,
            documents and external connectors must be re-synced from primary data sources.
          </div>
        </div>
      </div>

      {/* Backup & Restore Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cardConfigs.map((card) => (
          <BackupRestoreCard
            key={card.section}
            section={card.section}
            title={card.title}
            scope={card.scope}
            onBackup={card.backupHandler}
            onRestore={ops.handleRestore}
            onDeleteBackup={ops.handleDeleteBackup}
            onDownloadBackup={ops.handleDownloadBackup}
            processor={card.restoreProcessor}
            availableBackups={ops.backupFiles[card.section] || []}
            selectedBackup={ops.selectedRestoreFiles[card.section] || ''}
            onBackupSelectionChange={ops.handleBackupSelectionChange}
            loadingSection={ops.loadingSection}
            isGloballyLoading={ops.isLoading || ops.isLoadingFiles}
            onShowInfo={ops.setInfoModalKey}
          />
        ))}
      </div>

      {/* Logs Console */}
      <BackupLogConsole
        isLoading={ops.isLoading}
        loadingSection={ops.loadingSection}
        error={ops.error}
        logs={ops.logs}
      />
    </div>
  );
};

export default BackupPage;
