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
import ChatHistoryArchiveViewer from './ChatHistoryArchiveViewer';
import RestoreSelectionModal, { SelectableItem } from './RestoreSelectionModal';
import ClientSecretPrompt from './ClientSecretPrompt';
import CurlInfoModal from '../CurlInfoModal';
import DestructiveConfirmModal from '../DestructiveConfirmModal';
import { Authorization, Config, DiscoverySession } from '../../types';
import type { RestoreProcessor } from '../../hooks/useBackupOperations';

export interface BackupModalsProps {
  chatHistoryArchiveData: { sessions: DiscoverySession[]; fileName: string } | null;
  onCloseChatHistory: () => void;
  apiConfig: Omit<Config, 'accessToken'>;
  modalData: {
    section: string;
    title: string;
    items: SelectableItem[];
    processor: RestoreProcessor;
    originalData: any;
  } | null;
  onCloseModalData: () => void;
  onConfirmModalData: (selectedItems: SelectableItem[]) => void;
  isLoading: boolean;
  secretPrompt: {
    auth: Authorization;
    resolve: (secret: string | null) => void;
    customMessage?: string;
  } | null;
  onSecretSubmit: (secret: string) => void;
  onSecretClose: () => void;
  infoModalKey: string | null;
  onCloseInfoModal: () => void;
  backupToDelete: { section: string; filename: string } | null;
  onCloseDeleteBackup: () => void;
  onConfirmDeleteBackup: () => void;
  selectedBucket: string;
  restoreConfirmData: {
    section: string;
    items: SelectableItem[];
    processor: RestoreProcessor;
    originalData: any;
  } | null;
  onCloseRestoreConfirm: () => void;
  onExecuteRestoreConfirm: () => void;
}

export const BackupModals: React.FC<BackupModalsProps> = ({
  chatHistoryArchiveData,
  onCloseChatHistory,
  apiConfig,
  modalData,
  onCloseModalData,
  onConfirmModalData,
  isLoading,
  secretPrompt,
  onSecretSubmit,
  onSecretClose,
  infoModalKey,
  onCloseInfoModal,
  backupToDelete,
  onCloseDeleteBackup,
  onConfirmDeleteBackup,
  selectedBucket,
  restoreConfirmData,
  onCloseRestoreConfirm,
  onExecuteRestoreConfirm,
}) => {
  return (
    <>
      {/* Chat History Archive Viewer Modal */}
      {chatHistoryArchiveData && (
        <ChatHistoryArchiveViewer
          sessions={chatHistoryArchiveData.sessions}
          fileName={chatHistoryArchiveData.fileName}
          onClose={onCloseChatHistory}
          config={apiConfig}
        />
      )}

      {/* Restore Selection Modal */}
      {modalData && (
        <RestoreSelectionModal
          isOpen={!!modalData}
          onClose={onCloseModalData}
          onConfirm={onConfirmModalData}
          title={modalData.title}
          items={modalData.items}
          isLoading={isLoading}
        />
      )}

      {/* Client Secret Prompt Modal */}
      {secretPrompt && (
        <ClientSecretPrompt
          isOpen={!!secretPrompt}
          authId={secretPrompt.auth.name.split('/').pop() || ''}
          onSubmit={onSecretSubmit}
          onClose={onSecretClose}
          customMessage={secretPrompt.customMessage}
        />
      )}

      {/* Curl Info Modal */}
      {infoModalKey && (
        <CurlInfoModal infoKey={infoModalKey} onClose={onCloseInfoModal} />
      )}

      {/* Destructive Confirm Modal for Backup Deletion */}
      <DestructiveConfirmModal
        isOpen={!!backupToDelete}
        onClose={onCloseDeleteBackup}
        onConfirm={onConfirmDeleteBackup}
        title="Delete Backup File from Cloud Storage"
        resourceType="Backup File"
        resources={
          backupToDelete
            ? [
                {
                  name: backupToDelete.filename,
                  details: `gs://${selectedBucket}/${backupToDelete.filename}`,
                },
              ]
            : []
        }
        confirmKeyword={backupToDelete?.filename || 'DELETE'}
        confirmButtonText="Delete Backup"
        description={`You are about to delete the backup file "${backupToDelete?.filename}" from Cloud Storage bucket "gs://${selectedBucket}".`}
        consequences={[
          'This backup file will be permanently deleted from Google Cloud Storage.',
          'Any snapshots, agents, and configuration versions saved in this file cannot be recovered.',
          'Active systems will not be affected, but you will lose this historical restore point.',
        ]}
      />

      {/* Destructive Confirm Modal for Selective Restore */}
      <DestructiveConfirmModal
        isOpen={!!restoreConfirmData}
        onClose={onCloseRestoreConfirm}
        onConfirm={onExecuteRestoreConfirm}
        title={`Confirm Restore: ${restoreConfirmData ? restoreConfirmData.section.replace(/[A-Z]/g, ' $&').trim() : ''}`}
        resourceType={
          restoreConfirmData
            ? restoreConfirmData.section.replace(/[A-Z]/g, ' $&').trim()
            : 'Resource'
        }
        resources={
          restoreConfirmData
            ? restoreConfirmData.items.map((it: any) => ({
                name: it.displayName || it.name?.split('/').pop() || it.name || 'Item',
                details: it.name || undefined,
              }))
            : []
        }
        confirmKeyword={apiConfig.projectId || 'RESTORE'}
        confirmButtonText={`Restore into ${apiConfig.projectId || 'Project'}`}
        description={`You are about to restore ${restoreConfirmData?.items.length || 0} item(s) from backup into target project "${apiConfig.projectId}" (Location: ${apiConfig.appLocation}).`}
        consequences={[
          `Target project "${apiConfig.projectId}" will have existing resources overwritten or augmented with data from this backup.`,
          'Any IAM policy bindings and roles contained in the backup snapshot will be written directly to the target resources.',
          'Existing agents or configurations with conflicting names or IDs may be impacted.',
          'This action executes live Google Cloud mutations and cannot be automatically rolled back.',
        ]}
        isLoading={isLoading}
      />
    </>
  );
};

export default BackupModals;
