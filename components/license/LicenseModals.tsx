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
import JsonViewModal from './JsonViewModal';
import PruneLicensesModal from './PruneLicensesModal';
import ExportLicenseModal from './ExportLicenseModal';
import PrunerDeploymentModal from './PrunerDeploymentModal';
import DistributeLicenseModal from './DistributeLicenseModal';
import RetractLicenseModal from './RetractLicenseModal';
import GroupLicenseDeploymentModal from './GroupLicenseDeploymentModal';
import ConfirmationModal from '../ConfirmationModal';
import DestructiveConfirmModal from '../DestructiveConfirmModal';
import { UserLicense, LicenseConfig } from './types';
import { DistributeModalData, RetractModalData, GroupLicensingEditConfig } from '../../types';

interface LicenseModalsProps {
  projectNumber: string;
  apiConfig: { appLocation: string; userStoreId: string };
  onBuildTriggered?: (buildId: string) => void;
  // Json Modal
  jsonModalData: UserLicense | null;
  onCloseJsonModal: () => void;
  // Prune Modal
  isPruneModalOpen: boolean;
  onClosePruneModal: () => void;
  onConfirmPrune: (days: number, includeNeverLoggedIn?: boolean) => Promise<void>;
  userLicenses: UserLicense[];
  isActionLoading: boolean;
  // Export Modal
  isExportModalOpen: boolean;
  onCloseExportModal: () => void;
  filteredUserLicenses: UserLicense[];
  licenseNames: Record<string, string>;
  // Pruner Deployment Modal
  isDeploymentModalOpen: boolean;
  onCloseDeploymentModal: () => void;
  // Single Delete Confirmation Modal
  licenseToDelete: UserLicense | null;
  isDeleteModalOpen: boolean;
  onCloseDeleteModal: () => void;
  onConfirmSingleDelete: () => Promise<void>;
  actionType: 'revoke' | 'delete';
  // Distribute Modal
  distributeModalProps: DistributeModalData | null;
  onCloseDistributeModal: () => void;
  onDistributeSuccess: () => void;
  // Retract Modal
  retractModalProps: RetractModalData | null;
  onCloseRetractModal: () => void;
  onRetractSuccess: () => void;
  // Group Deployment Modal
  isGroupDeploymentModalOpen: boolean;
  onCloseGroupDeploymentModal: () => void;
  apiLicenseConfigs: LicenseConfig[];
  selectedServiceForEdit: GroupLicensingEditConfig | null;
  // Bulk Destructive Modal
  isBulkConfirmOpen: boolean;
  onCloseBulkConfirm: () => void;
  onConfirmBulkAction: () => void;
  bulkActionConfig: string;
  selectedUsers: Set<string>;
  onExportBulkUsersCsv: () => void;
  isBulkActionLoading: boolean;
  // Service Delete Modal
  serviceToDelete: string | null;
  onCloseServiceDeleteModal: () => void;
  onConfirmServiceDelete: () => Promise<void>;
  isDeletingService: boolean;
}

export const LicenseModals: React.FC<LicenseModalsProps> = ({
  projectNumber,
  apiConfig,
  onBuildTriggered,
  jsonModalData,
  onCloseJsonModal,
  isPruneModalOpen,
  onClosePruneModal,
  onConfirmPrune,
  userLicenses,
  isActionLoading,
  isExportModalOpen,
  onCloseExportModal,
  filteredUserLicenses,
  licenseNames,
  isDeploymentModalOpen,
  onCloseDeploymentModal,
  licenseToDelete,
  isDeleteModalOpen,
  onCloseDeleteModal,
  onConfirmSingleDelete,
  actionType,
  distributeModalProps,
  onCloseDistributeModal,
  onDistributeSuccess,
  retractModalProps,
  onCloseRetractModal,
  onRetractSuccess,
  isGroupDeploymentModalOpen,
  onCloseGroupDeploymentModal,
  apiLicenseConfigs,
  selectedServiceForEdit,
  isBulkConfirmOpen,
  onCloseBulkConfirm,
  onConfirmBulkAction,
  bulkActionConfig,
  selectedUsers,
  onExportBulkUsersCsv,
  isBulkActionLoading,
  serviceToDelete,
  onCloseServiceDeleteModal,
  onConfirmServiceDelete,
  isDeletingService,
}) => {
  return (
    <>
      <JsonViewModal
        isOpen={!!jsonModalData}
        onClose={onCloseJsonModal}
        data={jsonModalData}
        title={jsonModalData?.userPrincipal ? `Details: ${jsonModalData.userPrincipal}` : 'License Details'}
      />

      <PruneLicensesModal
        isOpen={isPruneModalOpen}
        onClose={onClosePruneModal}
        onConfirm={onConfirmPrune}
        userLicenses={userLicenses}
        isDeleting={isActionLoading}
      />

      <ExportLicenseModal
        isOpen={isExportModalOpen}
        onClose={onCloseExportModal}
        projectNumber={projectNumber}
        userLicenses={userLicenses}
        filteredUserLicenses={filteredUserLicenses}
        licenseNames={licenseNames}
      />

      {isDeploymentModalOpen && (
        <PrunerDeploymentModal
          isOpen={isDeploymentModalOpen}
          onClose={onCloseDeploymentModal}
          projectNumber={projectNumber}
          currentConfig={apiConfig}
          onBuildTriggered={onBuildTriggered}
        />
      )}

      {licenseToDelete && (
        <ConfirmationModal
          isOpen={isDeleteModalOpen}
          onClose={onCloseDeleteModal}
          onConfirm={onConfirmSingleDelete}
          title={actionType === 'delete' ? 'Delete User' : 'Revoke License'}
          confirmText={actionType === 'delete' ? 'Delete' : 'Revoke'}
          isConfirming={isActionLoading}
        >
          <p>
            Are you sure you want to {actionType === 'delete' ? 'delete the user record for' : 'revoke the license for'}{' '}
            <strong>{licenseToDelete.userPrincipal}</strong>?
          </p>
          <p className="text-gray-400 text-xs mt-2">
            {actionType === 'delete'
              ? 'This will remove the user record entirely.'
              : 'This will remove the license assignment immediately.'}
          </p>
        </ConfirmationModal>
      )}

      {distributeModalProps && (
        <DistributeLicenseModal
          isOpen={!!distributeModalProps}
          onClose={onCloseDistributeModal}
          onSuccess={onDistributeSuccess}
          {...distributeModalProps}
        />
      )}

      {retractModalProps && (
        <RetractLicenseModal
          isOpen={!!retractModalProps}
          onClose={onCloseRetractModal}
          onSuccess={onRetractSuccess}
          {...retractModalProps}
        />
      )}

      {isGroupDeploymentModalOpen && (
        <GroupLicenseDeploymentModal
          isOpen={isGroupDeploymentModalOpen}
          onClose={onCloseGroupDeploymentModal}
          projectNumber={projectNumber}
          currentConfig={apiConfig}
          apiLicenseConfigs={apiLicenseConfigs}
          editConfig={selectedServiceForEdit}
          onBuildTriggered={onBuildTriggered}
        />
      )}

      <DestructiveConfirmModal
        isOpen={isBulkConfirmOpen}
        onClose={onCloseBulkConfirm}
        onConfirm={onConfirmBulkAction}
        title={`Confirm Bulk ${bulkActionConfig === 'DELETE' ? 'Deletion' : 'Revocation'}`}
        resourceType="User License"
        resources={Array.from(selectedUsers).map((u) => ({ name: u }))}
        confirmKeyword={bulkActionConfig === 'DELETE' ? 'DELETE' : 'REVOKE'}
        confirmButtonText={
          bulkActionConfig === 'DELETE'
            ? `Delete ${selectedUsers.size} Licenses`
            : `Revoke ${selectedUsers.size} Licenses`
        }
        description={
          bulkActionConfig === 'DELETE'
            ? `You are about to permanently delete license assignments for ${selectedUsers.size} user${
                selectedUsers.size === 1 ? '' : 's'
              }.`
            : `You are about to revoke license access for ${selectedUsers.size} user${
                selectedUsers.size === 1 ? '' : 's'
              }.`
        }
        consequences={[
          `This will ${bulkActionConfig === 'DELETE' ? 'permanently delete' : 'revoke'} license bindings for ${
            selectedUsers.size
          } selected user${selectedUsers.size === 1 ? '' : 's'}.`,
          'Affected users will immediately lose access to Gemini Enterprise licenses assigned through this configuration.',
          'This action modifies Cloud IAM permissions directly in Google Cloud and cannot be automatically rolled back.',
        ]}
        onExport={onExportBulkUsersCsv}
        exportButtonText="Export Selected Users (CSV)"
        isLoading={isBulkActionLoading}
      />

      <DestructiveConfirmModal
        isOpen={!!serviceToDelete}
        onClose={onCloseServiceDeleteModal}
        onConfirm={onConfirmServiceDelete}
        title="Delete Group Licensing Service"
        resourceType="Cloud Run Service"
        resources={serviceToDelete ? [{ name: serviceToDelete }] : []}
        confirmKeyword={serviceToDelete || 'DELETE'}
        confirmButtonText="Delete Service"
        description={`You are about to delete the Cloud Run group synchronization service "${serviceToDelete}".`}
        consequences={[
          `The Cloud Run service "${serviceToDelete}" will be permanently deleted from project ${projectNumber}.`,
          'Automated synchronization jobs and Cloud Scheduler triggers targeting this service will fail.',
          'Any automatic group-to-license mapping managed by this service will stop running.',
        ]}
        isLoading={isDeletingService}
      />
    </>
  );
};
