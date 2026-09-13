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
import ProjectInput from '../components/ProjectInput';
import { useLicenseManagement } from '../hooks/useLicenseManagement';
import { UserLicensesTab } from '../components/license/UserLicensesTab';
import { AllocationsTab } from '../components/license/AllocationsTab';
import { GroupAssignmentsTab } from '../components/license/GroupAssignmentsTab';
import { LicenseModals } from '../components/license/LicenseModals';

export interface LicensePageProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
  onBuildTriggered?: (buildId: string) => void;
}

const LicensePage: React.FC<LicensePageProps> = ({
  projectNumber,
  setProjectNumber,
  onBuildTriggered,
}) => {
  const licenseState = useLicenseManagement(projectNumber);

  return (
    <div className="space-y-6">
      <LicenseModals
        projectNumber={projectNumber}
        apiConfig={licenseState.apiConfig}
        onBuildTriggered={onBuildTriggered}
        jsonModalData={licenseState.jsonModalData}
        onCloseJsonModal={() => licenseState.setJsonModalData(null)}
        isPruneModalOpen={licenseState.isPruneModalOpen}
        onClosePruneModal={() => licenseState.setIsPruneModalOpen(false)}
        onConfirmPrune={licenseState.handlePrune}
        userLicenses={licenseState.userLicenses}
        isActionLoading={licenseState.isActionLoading}
        isExportModalOpen={licenseState.isExportModalOpen}
        onCloseExportModal={() => licenseState.setIsExportModalOpen(false)}
        filteredUserLicenses={licenseState.filteredUserLicenses}
        licenseNames={licenseState.licenseNames}
        isDeploymentModalOpen={licenseState.isDeploymentModalOpen}
        onCloseDeploymentModal={() => licenseState.setIsDeploymentModalOpen(false)}
        licenseToDelete={licenseState.licenseToDelete}
        isDeleteModalOpen={licenseState.isDeleteModalOpen}
        onCloseDeleteModal={() => licenseState.setIsDeleteModalOpen(false)}
        onConfirmSingleDelete={licenseState.confirmSingleDelete}
        actionType={licenseState.actionType}
        distributeModalProps={licenseState.distributeModalProps}
        onCloseDistributeModal={() => licenseState.setDistributeModalProps(null)}
        onDistributeSuccess={() => {
          licenseState.fetchBillingConfigs();
          if (licenseState.distributeModalProps?.currentProjectNumber === projectNumber) {
            licenseState.fetchUserLicenses();
          }
        }}
        retractModalProps={licenseState.retractModalProps}
        onCloseRetractModal={() => licenseState.setRetractModalProps(null)}
        onRetractSuccess={() => {
          licenseState.fetchBillingConfigs();
          if (licenseState.retractModalProps?.currentProjectNumber === projectNumber) {
            licenseState.fetchUserLicenses();
          }
        }}
        isGroupDeploymentModalOpen={licenseState.isGroupDeploymentModalOpen}
        onCloseGroupDeploymentModal={() => {
          licenseState.setIsGroupDeploymentModalOpen(false);
          licenseState.setSelectedServiceForEdit(null);
        }}
        apiLicenseConfigs={licenseState.apiLicenseConfigs}
        selectedServiceForEdit={licenseState.selectedServiceForEdit}
        isBulkConfirmOpen={licenseState.isBulkConfirmOpen}
        onCloseBulkConfirm={() => licenseState.setIsBulkConfirmOpen(false)}
        onConfirmBulkAction={() => {
          licenseState.setIsBulkConfirmOpen(false);
          void licenseState.executeBulkAction();
        }}
        bulkActionConfig={licenseState.bulkActionConfig}
        selectedUsers={licenseState.selectedUsers}
        onExportBulkUsersCsv={licenseState.exportSelectedUsersCsv}
        isBulkActionLoading={licenseState.isBulkActionLoading}
        serviceToDelete={licenseState.serviceToDelete}
        onCloseServiceDeleteModal={() => licenseState.setServiceToDelete(null)}
        onConfirmServiceDelete={licenseState.confirmDeleteService}
        isDeletingService={licenseState.isDeletingService}
      />

      {/* Configuration Header */}
      <div className="bg-gray-800 p-4 rounded-lg shadow-md">
        <h2 className="text-lg font-semibold text-white mb-3">Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
            <ProjectInput value={projectNumber} onChange={setProjectNumber} />
          </div>
          <div>
            <label htmlFor="appLocation" className="block text-sm font-medium text-gray-400 mb-1">
              Location
            </label>
            <select
              id="appLocation"
              name="appLocation"
              aria-label="Location"
              value={licenseState.apiConfig.appLocation}
              onChange={licenseState.handleApiConfigChange}
              className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[38px]"
            >
              <option value="global">global</option>
              <option value="us">us</option>
              <option value="eu">eu</option>
            </select>
          </div>
          <div>
            <label htmlFor="userStoreId" className="block text-sm font-medium text-gray-400 mb-1">
              User Store ID
            </label>
            <input
              type="text"
              id="userStoreId"
              name="userStoreId"
              aria-label="User Store ID"
              value={licenseState.apiConfig.userStoreId}
              onChange={licenseState.handleApiConfigChange}
              className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white w-full h-[38px]"
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-700">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => licenseState.setActiveTab('user_licenses')}
            className={`${
              licenseState.activeTab === 'user_licenses'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-150`}
          >
            User Assignments
          </button>
          <button
            onClick={() => licenseState.setActiveTab('allocations')}
            className={`${
              licenseState.activeTab === 'allocations'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-150`}
          >
            Allocation Management (Billing Account)
          </button>
          <button
            onClick={() => licenseState.setActiveTab('group_assignments')}
            className={`${
              licenseState.activeTab === 'group_assignments'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-150`}
          >
            Group License Assignments
          </button>
        </nav>
      </div>

      {licenseState.activeTab === 'user_licenses' ? (
        <UserLicensesTab
          projectNumber={projectNumber}
          userLicenses={licenseState.userLicenses}
          filteredUserLicenses={licenseState.filteredUserLicenses}
          sortedUserLicenses={licenseState.sortedUserLicenses}
          paginatedUserLicenses={licenseState.paginatedUserLicenses}
          totalLicensesUsed={licenseState.totalLicensesUsed}
          isLicensesLoading={licenseState.isLicensesLoading}
          licensesError={licenseState.licensesError}
          cacheTimestamp={licenseState.cacheTimestamp}
          fetchProgress={licenseState.fetchProgress}
          fetchUserLicenses={licenseState.fetchUserLicenses}
          licenseNames={licenseState.licenseNames}
          currentPage={licenseState.currentPage}
          setCurrentPage={licenseState.setCurrentPage}
          pageSize={licenseState.pageSize}
          setPageSize={licenseState.setPageSize}
          totalPages={licenseState.totalPages}
          sortConfig={licenseState.sortConfig}
          handleSort={licenseState.handleSort}
          filterPrincipal={licenseState.filterPrincipal}
          setFilterPrincipal={licenseState.setFilterPrincipal}
          inputPrincipal={licenseState.inputPrincipal}
          setInputPrincipal={licenseState.setInputPrincipal}
          filterConfig={licenseState.filterConfig}
          setFilterConfig={licenseState.setFilterConfig}
          inputConfig={licenseState.inputConfig}
          setInputConfig={licenseState.setInputConfig}
          filterStatus={licenseState.filterStatus}
          setFilterStatus={licenseState.setFilterStatus}
          filterDateOperator={licenseState.filterDateOperator}
          setFilterDateOperator={licenseState.setFilterDateOperator}
          filterDateValue={licenseState.filterDateValue}
          setFilterDateValue={licenseState.setFilterDateValue}
          inputDateValue={licenseState.inputDateValue}
          setInputDateValue={licenseState.setInputDateValue}
          selectedUsers={licenseState.selectedUsers}
          handleSelectAll={licenseState.handleSelectAll}
          handleSelectUser={licenseState.handleSelectUser}
          bulkActionConfig={licenseState.bulkActionConfig}
          setBulkActionConfig={licenseState.setBulkActionConfig}
          isBulkActionLoading={licenseState.isBulkActionLoading}
          handleBulkActionClick={licenseState.handleBulkActionClick}
          apiLicenseConfigs={licenseState.apiLicenseConfigs}
          setIsExportModalOpen={licenseState.setIsExportModalOpen}
          setIsPruneModalOpen={licenseState.setIsPruneModalOpen}
          setIsDeploymentModalOpen={licenseState.setIsDeploymentModalOpen}
          setJsonModalData={licenseState.setJsonModalData}
          requestDelete={licenseState.requestDelete}
          isActionLoading={licenseState.isActionLoading}
        />
      ) : licenseState.activeTab === 'allocations' ? (
        <AllocationsTab
          projectNumber={projectNumber}
          billingAccountId={licenseState.billingAccountId}
          setBillingAccountId={licenseState.setBillingAccountId}
          availableBillingAccounts={licenseState.availableBillingAccounts}
          isBillingAccountsLoading={licenseState.isBillingAccountsLoading}
          hasBillingPermission={licenseState.hasBillingPermission}
          setHasBillingPermission={licenseState.setHasBillingPermission}
          isBillingLoading={licenseState.isBillingLoading}
          billingConfigs={licenseState.billingConfigs}
          setBillingConfigs={licenseState.setBillingConfigs}
          projectNames={licenseState.projectNames}
          fetchBillingConfigs={licenseState.fetchBillingConfigs}
          setDistributeModalProps={licenseState.setDistributeModalProps}
          setRetractModalProps={licenseState.setRetractModalProps}
        />
      ) : (
        <GroupAssignmentsTab
          isServicesLoading={licenseState.isServicesLoading}
          servicesError={licenseState.servicesError}
          groupServices={licenseState.groupServices}
          lastRunTimes={licenseState.lastRunTimes}
          apiLicenseConfigs={licenseState.apiLicenseConfigs}
          onNewAssignment={() => {
            licenseState.setSelectedServiceForEdit(null);
            licenseState.setIsGroupDeploymentModalOpen(true);
          }}
          onRunService={licenseState.handleRunService}
          onEditService={licenseState.handleEditService}
          onDeleteService={(name) => licenseState.setServiceToDelete(name)}
        />
      )}
    </div>
  );
};

export default LicensePage;
