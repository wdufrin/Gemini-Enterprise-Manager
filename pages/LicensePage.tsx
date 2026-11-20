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
import { Page } from '../types';
import PageShell from '../components/layout/PageShell';
import PageHeader from '../components/layout/PageHeader';
import ScopeBar from '../components/layout/ScopeBar';
import { Tabs, TabItem } from '../components/common/Tabs';
import { useLicenseManagement, LicenseTabId } from '../hooks/useLicenseManagement';
import { UserLicensesTab } from '../components/license/UserLicensesTab';
import { AllocationsTab } from '../components/license/AllocationsTab';
import { UserStoreConfigTab } from '../components/license/UserStoreConfigTab';
import { GroupAssignmentsTab } from '../components/license/GroupAssignmentsTab';
import { LicenseModals } from '../components/license/LicenseModals';
import { PrunerDeploymentModal } from '../components/license/PrunerDeploymentModal';

export interface LicensePageProps {
  projectNumber: string;
  projectId?: string;
  setProjectNumber: (projectNumber: string) => void;
  onBuildTriggered?: (buildId: string, projectId?: string) => void;
}

const LICENSE_TAB_ITEMS: readonly TabItem<LicenseTabId>[] = [
  { id: 'user_licenses', label: 'User Assignments' },
  { id: 'allocations', label: 'Allocation Management (Billing Account)' },
  { id: 'user_store_policy', label: 'Auto-Licensing & Overage Policy' },
  { id: 'group_assignments', label: 'Group License Assignments' },
  { id: 'automated_pruner', label: 'Automated License Pruner' },
];

const LicensePage: React.FC<LicensePageProps> = ({
  projectNumber,
  projectId,
  onBuildTriggered,
}) => {
  const licenseState = useLicenseManagement(projectNumber);

  const handleBuildTriggered = (buildId: string, buildProjectId?: string) => {
    onBuildTriggered?.(buildId, buildProjectId);
    void licenseState.fetchGroupServices();
  };

  return (
    <PageShell variant="wide">
      <LicenseModals
        projectNumber={projectNumber}
        apiConfig={licenseState.apiConfig}
        onBuildTriggered={handleBuildTriggered}
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
        licenseToDelete={licenseState.licenseToDelete}
        isDeleteModalOpen={licenseState.isDeleteModalOpen}
        onCloseDeleteModal={() => licenseState.setIsDeleteModalOpen(false)}
        onConfirmSingleDelete={licenseState.confirmSingleDelete}
        actionType={licenseState.actionType}
        distributeModalProps={licenseState.distributeModalProps}
        onCloseDistributeModal={() => licenseState.setDistributeModalProps(null)}
        onDistributeSuccess={() => {
          void licenseState.fetchBillingConfigs();
          if (licenseState.distributeModalProps?.currentProjectNumber === projectNumber) {
            void licenseState.fetchUserLicenses();
          }
        }}
        retractModalProps={licenseState.retractModalProps}
        onCloseRetractModal={() => licenseState.setRetractModalProps(null)}
        onRetractSuccess={() => {
          void licenseState.fetchBillingConfigs();
          if (licenseState.retractModalProps?.currentProjectNumber === projectNumber) {
            void licenseState.fetchUserLicenses();
          }
        }}
        isGroupDeploymentModalOpen={licenseState.isGroupDeploymentModalOpen}
        onCloseGroupDeploymentModal={() => {
          licenseState.setIsGroupDeploymentModalOpen(false);
          licenseState.setSelectedServiceForEdit(null);
        }}
        apiLicenseConfigs={licenseState.apiLicenseConfigs}
        selectedServiceForEdit={licenseState.selectedServiceForEdit}
        onGroupConfigSaved={() => void licenseState.fetchGroupServices()}
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

      <PageHeader
        title="Licenses"
        subtitle="Manage Gemini Enterprise seat assignments, CSV onboarding, billing allocations, overage policy, and automated pruning."
        consolePage={Page.LICENSE}
        projectId={projectId}
        projectNumber={projectNumber}
        onRefresh={() => void licenseState.fetchUserLicenses(true)}
        isRefreshing={licenseState.isLicensesLoading}
        refreshDisabled={!projectNumber}
      >
        <ScopeBar
          embedded
          locationValue={licenseState.apiConfig.appLocation}
          onLocationChange={licenseState.setAppLocation}
          locationId="appLocation"
          locationLabel="Location"
        >
          <div className="min-w-[200px] sm:min-w-[240px]">
            <label
              htmlFor="userStoreId"
              className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1"
            >
              User Store ID
            </label>
            <input
              type="text"
              id="userStoreId"
              name="userStoreId"
              aria-label="User Store ID"
              value={licenseState.apiConfig.userStoreId}
              onChange={licenseState.handleApiConfigChange}
              placeholder="default_user_store"
              className="w-full h-9 bg-gray-950/90 border border-gray-700/90 rounded-lg px-3 text-xs sm:text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </ScopeBar>
      </PageHeader>

      <Tabs
        items={LICENSE_TAB_ITEMS}
        activeTab={licenseState.activeTab}
        onChange={licenseState.setActiveTab}
        ariaLabel="License management sections"
        syncSearchParam="tab"
      />

      {licenseState.activeTab === 'user_licenses' ? (
        <UserLicensesTab
          projectNumber={projectNumber}
          appLocation={licenseState.apiConfig.appLocation}
          userStoreId={licenseState.apiConfig.userStoreId}
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
          onSetupAutoPruner={() => licenseState.setActiveTab('automated_pruner')}
          isBulkAssignCsvModalOpen={licenseState.isBulkAssignCsvModalOpen}
          setIsBulkAssignCsvModalOpen={licenseState.setIsBulkAssignCsvModalOpen}
          onExecuteBulkAssignCsv={licenseState.handleBulkAssignCsvEmails}
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
      ) : licenseState.activeTab === 'user_store_policy' ? (
        <UserStoreConfigTab
          projectNumber={projectNumber}
          appLocation={licenseState.apiConfig.appLocation}
          userStoreId={licenseState.apiConfig.userStoreId}
          apiLicenseConfigs={licenseState.apiLicenseConfigs}
        />
      ) : licenseState.activeTab === 'group_assignments' ? (
        <GroupAssignmentsTab
          isServicesLoading={licenseState.isServicesLoading}
          servicesError={licenseState.servicesError}
          groupServices={licenseState.groupServices}
          lastRunTimes={licenseState.lastRunTimes}
          serviceGroups={licenseState.serviceGroups}
          runningServices={licenseState.runningServices}
          serviceReports={licenseState.serviceReports}
          activeReport={licenseState.activeReport}
          apiLicenseConfigs={licenseState.apiLicenseConfigs}
          onNewAssignment={() => {
            licenseState.setSelectedServiceForEdit(null);
            licenseState.setIsGroupDeploymentModalOpen(true);
          }}
          onRunService={licenseState.handleRunService}
          onViewReport={licenseState.handleViewServiceReport}
          onCloseReport={() => licenseState.setActiveReport(null)}
          onEditService={licenseState.handleEditService}
          onDeleteService={(name) => licenseState.setServiceToDelete(name)}
        />
      ) : (
        <PrunerDeploymentModal
          isOpen={true}
          inline={true}
          onClose={() => licenseState.setActiveTab('user_licenses')}
          projectNumber={projectNumber}
          currentConfig={licenseState.apiConfig}
          onBuildTriggered={handleBuildTriggered}
          onOpenManualPrune={() => licenseState.setIsPruneModalOpen(true)}
        />
      )}
    </PageShell>
  );
};

export default LicensePage;
