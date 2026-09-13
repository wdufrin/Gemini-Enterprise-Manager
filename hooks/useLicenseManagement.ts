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

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as api from '../services/apiService';
import { Config, DistributeModalData, RetractModalData } from '../types';
import { toErrorMessage } from '../utils/errors';
import { useToast } from '../context/ToastContext';
import {
  getCachedUserLicenses,
  setCachedUserLicenses,
  updateCachedUserLicenses,
} from '../services/licenseCache';
import {
  UserLicense,
  LicenseConfig,
  BillingAccount,
  BillingAccountLicenseConfig,
  CloudRunServiceItem,
  SortKey,
  SortDirection,
} from '../components/license/types';
import { filterUserLicenses, sortUserLicenses } from '../components/license/licenseFilters';
import { useGroupLicensing } from './useGroupLicensing';

export function useLicenseManagement(projectNumber: string) {
  const { toast } = useToast();

  // --- Cloud License API State ---
  const [apiConfig, setApiConfig] = useState({
    appLocation: 'global',
    userStoreId: 'default_user_store',
  });

  // User Licenses List State
  const [userLicenses, setUserLicenses] = useState<UserLicense[]>([]);
  const [userLicensesFilter, setUserLicensesFilter] = useState('');
  const [isLicensesLoading, setIsLicensesLoading] = useState(false);
  const [licensesError, setLicensesError] = useState<string | null>(null);

  // Cache & Progress State
  const [cacheTimestamp, setCacheTimestamp] = useState<number | null>(null);
  const [fetchProgress, setFetchProgress] = useState<{ loaded: number; isFetching: boolean } | null>(null);

  // Client-Side Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // License Config Names Cache
  const [licenseNames, setLicenseNames] = useState<Record<string, string>>({});

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'lastLoginTime',
    direction: 'desc',
  });

  // Modal States
  const [jsonModalData, setJsonModalData] = useState<UserLicense | null>(null);
  const [isPruneModalOpen, setIsPruneModalOpen] = useState(false);
  const [isDeploymentModalOpen, setIsDeploymentModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Single Delete State
  const [licenseToDelete, setLicenseToDelete] = useState<UserLicense | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [actionType, setActionType] = useState<'revoke' | 'delete'>('revoke');
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Column Filters State
  const [filterPrincipal, setFilterPrincipal] = useState<string>('');
  const [inputPrincipal, setInputPrincipal] = useState<string>('');
  const [filterConfig, setFilterConfig] = useState<string>('');
  const [inputConfig, setInputConfig] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterDateOperator, setFilterDateOperator] = useState<'>' | '<' | '='>('>');
  const [filterDateValue, setFilterDateValue] = useState<string>('');
  const [inputDateValue, setInputDateValue] = useState<string>('');

  // Tab State
  const [activeTab, setActiveTab] = useState<'user_licenses' | 'allocations' | 'group_assignments'>('user_licenses');

  // Billing Account State
  const [billingAccountId, setBillingAccountId] = useState('');
  const [billingConfigs, setBillingConfigs] = useState<BillingAccountLicenseConfig[]>([]);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const [hasBillingPermission, setHasBillingPermission] = useState<boolean | null>(null);

  // Allocation Modals
  const [distributeModalProps, setDistributeModalProps] = useState<DistributeModalData | null>(null);
  const [retractModalProps, setRetractModalProps] = useState<RetractModalData | null>(null);

  // Billing Accounts Dropdown
  const [availableBillingAccounts, setAvailableBillingAccounts] = useState<BillingAccount[]>([]);
  const [isBillingAccountsLoading, setIsBillingAccountsLoading] = useState(false);

  // API Configs for Dropdown
  const [apiLicenseConfigs, setApiLicenseConfigs] = useState<LicenseConfig[]>([]);

  // Bulk Actions
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [bulkActionConfig, setBulkActionConfig] = useState<string>('');
  const [isBulkActionLoading, setIsBulkActionLoading] = useState(false);
  const [isBulkConfirmOpen, setIsBulkConfirmOpen] = useState(false);

  // Group Licensing Hook
  const groupLicensing = useGroupLicensing(projectNumber, apiConfig.appLocation, activeTab);

  // Reset pagination on filter or sort change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterPrincipal, filterStatus, filterConfig, filterDateValue, filterDateOperator, sortConfig]);

  const handleApiConfigChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    setApiConfig({ ...apiConfig, [e.target.name]: e.target.value });
  };

  const resolvedLicenseNamesRef = useRef<Set<string>>(new Set());
  const resolveLicenseNames = useCallback(async (licenses: UserLicense[]) => {
    const uniqueConfigNames = Array.from(
      new Set(licenses.map((l) => l.licenseConfig).filter((c): c is string => typeof c === 'string' && c.length > 0))
    );

    const toFetch = uniqueConfigNames.filter((name) => !resolvedLicenseNamesRef.current.has(name));
    if (toFetch.length === 0) return;
    toFetch.forEach((name) => resolvedLicenseNamesRef.current.add(name));

    const newNames: Record<string, string> = {};
    const configForApi: Config = {
      projectId: projectNumber,
      appLocation: apiConfig.appLocation,
      collectionId: '',
      appId: '',
      assistantId: '',
    };

    await Promise.allSettled(
      toFetch.map(async (name) => {
        try {
          const details = await api.getLicenseConfig(name, configForApi);
          if (details.displayName) {
            newNames[name] = details.displayName;
          } else {
            newNames[name] = name.split('/').pop() || name;
          }
        } catch (e) {
          console.warn(`Failed to fetch license config details for ${name}`, e);
          newNames[name] = name.split('/').pop() || name;
        }
      })
    );

    setLicenseNames((prev) => ({ ...prev, ...newNames }));
  }, [projectNumber, apiConfig.appLocation]);

  const fetchUserLicenses = useCallback(async (forceRefresh: boolean = false) => {
    if (!projectNumber) return;
    setIsLicensesLoading(true);
    setLicensesError(null);

    try {
      if (!forceRefresh) {
        const cached = await getCachedUserLicenses(projectNumber, apiConfig.userStoreId);
        if (cached && cached.data && cached.data.length > 0) {
          setUserLicenses(cached.data);
          setCacheTimestamp(cached.timestamp);
          resolveLicenseNames(cached.data);
          setIsLicensesLoading(false);
          return;
        }
      }

      setFetchProgress({ loaded: 0, isFetching: true });

      const config: Config = {
        projectId: projectNumber,
        appLocation: apiConfig.appLocation,
        collectionId: '',
        appId: '',
        assistantId: '',
      };

      let allLicenses: UserLicense[] = [];
      let nextPageToken: string | undefined = undefined;

      do {
        const result = await api.listUserStoreLicenses(config, apiConfig.userStoreId, userLicensesFilter, nextPageToken, 1000);
        if (result.userLicenses) {
          allLicenses = [...allLicenses, ...result.userLicenses];
          setFetchProgress({ loaded: allLicenses.length, isFetching: true });
        }
        nextPageToken = result.nextPageToken;
      } while (nextPageToken);

      setUserLicenses(allLicenses);
      const now = Date.now();
      setCacheTimestamp(now);
      await setCachedUserLicenses(projectNumber, apiConfig.userStoreId, allLicenses);
      resolveLicenseNames(allLicenses);
    } catch (err: unknown) {
      setLicensesError(toErrorMessage(err) || 'Failed to list user licenses.');
    } finally {
      setIsLicensesLoading(false);
      setFetchProgress(null);
    }
  }, [projectNumber, apiConfig.userStoreId, apiConfig.appLocation, userLicensesFilter, resolveLicenseNames]);

  const fetchApiLicenseConfigs = useCallback(async () => {
    if (!projectNumber) return;
    try {
      const config: Config = {
        projectId: projectNumber,
        appLocation: apiConfig.appLocation,
        collectionId: '',
        appId: '',
        assistantId: '',
      };
      const res = await api.listLicenseConfigs(config);
      const activeConfigs = (res.licenseConfigs || []).filter((cfg: LicenseConfig) => cfg.state === 'ACTIVE');
      setApiLicenseConfigs(activeConfigs);
    } catch (e) {
      console.error('Failed to fetch license configs for dropdown', e);
    }
  }, [projectNumber, apiConfig.appLocation]);

  useEffect(() => {
    if (projectNumber) {
      fetchUserLicenses();
      fetchApiLicenseConfigs();
    }
  }, [projectNumber, fetchUserLicenses, fetchApiLicenseConfigs]);

  const fetchAvailableBillingAccounts = useCallback(async () => {
    setIsBillingAccountsLoading(true);
    try {
      const config: Config = {
        projectId: projectNumber,
        appLocation: apiConfig.appLocation,
        collectionId: '',
        appId: '',
        assistantId: '',
      };
      const res = await api.listBillingAccounts(config);
      const accounts = res.billingAccounts || [];
      setAvailableBillingAccounts(accounts);

      if (accounts.length === 1) {
        const id = accounts[0].name.split('/').pop();
        setBillingAccountId((prev) => prev || id || '');
      }
    } catch (e: unknown) {
      console.error('Failed to fetch billing accounts', e);
    } finally {
      setIsBillingAccountsLoading(false);
    }
  }, [projectNumber, apiConfig.appLocation]);

  useEffect(() => {
    if (activeTab === 'allocations' && projectNumber) {
      fetchAvailableBillingAccounts();
    }
  }, [activeTab, projectNumber, fetchAvailableBillingAccounts]);

  const fetchedProjectsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const fetchNames = async () => {
      const projectsToFetch = new Set<string>();
      billingConfigs.forEach((cfg) => {
        if (cfg.licenseConfigDistributions) {
          Object.keys(cfg.licenseConfigDistributions).forEach((resourceKey) => {
            const project = resourceKey.includes('projects/')
              ? resourceKey.split('projects/')[1].split('/')[0]
              : null;
            if (project && !fetchedProjectsRef.current.has(project)) {
              projectsToFetch.add(project);
              fetchedProjectsRef.current.add(project);
            }
          });
        }
      });

      for (const project of projectsToFetch) {
        try {
          const proj = await api.getProject(project);
          if (proj.name) {
            const name = proj.name;
            setProjectNames((prev) => ({ ...prev, [project]: name }));
          }
        } catch (e) {
          console.warn('Failed to resolve project name for', project, e);
        }
      }
    };
    fetchNames();
  }, [billingConfigs]);

  const fetchBillingConfigs = async () => {
    if (!billingAccountId) return;
    setIsBillingLoading(true);
    setLicensesError(null);
    setHasBillingPermission(null);
    try {
      const config: Config = {
        projectId: projectNumber,
        appLocation: apiConfig.appLocation,
        collectionId: '',
        appId: '',
        assistantId: '',
      };

      try {
        const permRes = await api.testBillingAccountPermissions(billingAccountId, config);
        if (!permRes.permissions || !permRes.permissions.includes('billing.accounts.get')) {
          setHasBillingPermission(false);
          setIsBillingLoading(false);
          setBillingConfigs([]);
          return;
        } else {
          setHasBillingPermission(true);
        }
      } catch (e) {
        console.warn('Permission test failed:', e);
      }

      const res = await api.listBillingAccountLicenseConfigs(billingAccountId, config);
      setBillingConfigs(res.billingAccountLicenseConfigs || []);
    } catch (e: unknown) {
      setLicensesError('Failed to fetch billing account configs: ' + toErrorMessage(e));
    } finally {
      setIsBillingLoading(false);
    }
  };

  const requestDelete = (license: UserLicense, type: 'revoke' | 'delete' = 'revoke') => {
    setLicenseToDelete(license);
    setActionType(type);
    setIsDeleteModalOpen(true);
  };

  const confirmSingleDelete = async () => {
    if (!licenseToDelete) return;
    const userPrincipal = licenseToDelete.userPrincipal;

    if (!userPrincipal) {
      setLicensesError(`Cannot ${actionType}: The license is missing the 'userPrincipal' (email) field required for revocation.`);
      setIsDeleteModalOpen(false);
      return;
    }

    setIsActionLoading(true);
    setLicensesError(null);
    try {
      const config: Config = {
        projectId: projectNumber,
        appLocation: apiConfig.appLocation,
        collectionId: '',
        appId: '',
        assistantId: '',
      };

      if (actionType === 'delete') {
        await api.deleteUserLicenses(config, apiConfig.userStoreId, [userPrincipal]);
        const filterFn = (prev: UserLicense[]) => prev.filter((l) => l.userPrincipal !== userPrincipal);
        setUserLicenses(filterFn);
        await updateCachedUserLicenses(projectNumber, apiConfig.userStoreId, filterFn);
      } else {
        await api.revokeUserLicenses(config, apiConfig.userStoreId, [userPrincipal]);
        const updateFn = (prev: UserLicense[]) =>
          prev.map((l) =>
            l.userPrincipal === userPrincipal
              ? { ...l, licenseAssignmentState: 'UNASSIGNED', licenseConfig: '' }
              : l
          );
        setUserLicenses(updateFn);
        await updateCachedUserLicenses(projectNumber, apiConfig.userStoreId, updateFn);
      }
    } catch (err: unknown) {
      setLicensesError(`Failed to ${actionType} license: ${toErrorMessage(err)}`);
      fetchUserLicenses(false);
    } finally {
      setIsActionLoading(false);
      setIsDeleteModalOpen(false);
      setLicenseToDelete(null);
    }
  };

  const handlePrune = async (days: number, includeNeverLoggedIn: boolean = false) => {
    setIsActionLoading(true);
    setLicensesError(null);
    try {
      const config: Config = {
        projectId: projectNumber,
        appLocation: apiConfig.appLocation,
        collectionId: '',
        appId: '',
        assistantId: '',
      };

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const toDelete = userLicenses.filter((l) => {
        if (!l.lastLoginTime) {
          if (!includeNeverLoggedIn) return false;
          if (l.createTime) {
            return new Date(l.createTime) < cutoff;
          }
          return true;
        }
        return new Date(l.lastLoginTime) < cutoff;
      });

      const principals = toDelete.map((l) => l.userPrincipal).filter(Boolean);

      if (principals.length > 0) {
        const CHUNK_SIZE = 100;
        for (let i = 0; i < principals.length; i += CHUNK_SIZE) {
          const chunk = principals.slice(i, i + CHUNK_SIZE);
          await api.revokeUserLicenses(config, apiConfig.userStoreId, chunk);
        }

        const principalSet = new Set(principals);
        const filterFn = (prev: UserLicense[]) => prev.filter((l) => !principalSet.has(l.userPrincipal));
        setUserLicenses(filterFn);
        await updateCachedUserLicenses(projectNumber, apiConfig.userStoreId, filterFn);
      }

      setIsPruneModalOpen(false);
    } catch (err: unknown) {
      setLicensesError(`Error during prune operation: ${toErrorMessage(err)}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const allVisiblePrincipals = sortedUserLicenses
        .map((l) => l.userPrincipal)
        .filter(Boolean) as string[];
      setSelectedUsers(new Set(allVisiblePrincipals));
    } else {
      setSelectedUsers(new Set());
    }
  };

  const handleSelectUser = (principal: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(principal)) {
      newSelected.delete(principal);
    } else {
      newSelected.add(principal);
    }
    setSelectedUsers(newSelected);
  };

  const handleBulkActionClick = () => {
    if (selectedUsers.size === 0 || !projectNumber || !bulkActionConfig) return;
    if (bulkActionConfig === 'REVOKE' || bulkActionConfig === 'DELETE') {
      setIsBulkConfirmOpen(true);
      return;
    }
    void executeBulkAction();
  };

  const exportSelectedUsersCsv = () => {
    const principals = Array.from(selectedUsers);
    const csv = [
      'User Principal,Action,Project Number',
      ...principals.map((p) => `"${p}","${bulkActionConfig}","${projectNumber}"`),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `license_bulk_${bulkActionConfig.toLowerCase()}_${principals.length}_users.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const executeBulkAction = async () => {
    if (selectedUsers.size === 0 || !projectNumber || !bulkActionConfig) return;

    setIsBulkActionLoading(true);
    setLicensesError(null);

    try {
      const config: Config = {
        projectId: projectNumber,
        appLocation: apiConfig.appLocation,
        collectionId: '',
        appId: '',
        assistantId: '',
      };

      const principals = Array.from(selectedUsers);
      const targetConfigName = bulkActionConfig.startsWith('license_config=')
        ? bulkActionConfig.replace('license_config="', '').replace('"', '')
        : bulkActionConfig;

      const CHUNK_SIZE = 100;
      for (let i = 0; i < principals.length; i += CHUNK_SIZE) {
        const chunk = principals.slice(i, i + CHUNK_SIZE);
        if (bulkActionConfig === 'REVOKE') {
          await api.revokeUserLicenses(config, apiConfig.userStoreId, chunk);
        } else if (bulkActionConfig === 'DELETE') {
          await api.deleteUserLicenses(config, apiConfig.userStoreId, chunk);
        } else {
          await api.assignUserLicenses(config, apiConfig.userStoreId, chunk, targetConfigName);
        }
      }

      const principalSet = new Set(principals);
      let updateFn: (prev: UserLicense[]) => UserLicense[];

      if (bulkActionConfig === 'DELETE') {
        updateFn = (prev) => prev.filter((l) => !principalSet.has(l.userPrincipal));
      } else if (bulkActionConfig === 'REVOKE') {
        updateFn = (prev) =>
          prev.map((l) =>
            principalSet.has(l.userPrincipal)
              ? { ...l, licenseAssignmentState: 'UNASSIGNED', licenseConfig: '' }
              : l
          );
      } else {
        updateFn = (prev) =>
          prev.map((l) =>
            principalSet.has(l.userPrincipal)
              ? { ...l, licenseAssignmentState: 'ASSIGNED', licenseConfig: targetConfigName }
              : l
          );
      }

      setUserLicenses(updateFn);
      await updateCachedUserLicenses(projectNumber, apiConfig.userStoreId, updateFn);
      setSelectedUsers(new Set());
    } catch (err: unknown) {
      setLicensesError(`Bulk action failed: ${toErrorMessage(err)}`);
    } finally {
      setIsBulkActionLoading(false);
    }
  };

  const filteredUserLicenses = useMemo(() => {
    return filterUserLicenses(
      userLicenses,
      {
        filterPrincipal,
        filterStatus,
        filterConfig,
        filterDateOperator,
        filterDateValue,
      },
      licenseNames
    );
  }, [userLicenses, filterPrincipal, filterStatus, filterConfig, filterDateOperator, filterDateValue, licenseNames]);

  const sortedUserLicenses = useMemo(() => {
    return sortUserLicenses(filteredUserLicenses, sortConfig, licenseNames);
  }, [filteredUserLicenses, sortConfig, licenseNames]);

  const totalLicensesUsed = useMemo(() => {
    return userLicenses.filter((l) => l.licenseAssignmentState === 'ASSIGNED').length;
  }, [userLicenses]);

  const totalPages = Math.max(1, Math.ceil(sortedUserLicenses.length / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const paginatedUserLicenses = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedUserLicenses.slice(startIndex, startIndex + pageSize);
  }, [sortedUserLicenses, currentPage, pageSize]);

  return {
    apiConfig,
    handleApiConfigChange,
    activeTab,
    setActiveTab,
    // User Licenses
    userLicenses,
    filteredUserLicenses,
    sortedUserLicenses,
    paginatedUserLicenses,
    totalLicensesUsed,
    isLicensesLoading,
    licensesError,
    setLicensesError,
    cacheTimestamp,
    fetchProgress,
    fetchUserLicenses,
    licenseNames,
    // Pagination
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    // Sorting
    sortConfig,
    handleSort,
    // Filtering
    filterPrincipal,
    setFilterPrincipal,
    inputPrincipal,
    setInputPrincipal,
    filterConfig,
    setFilterConfig,
    inputConfig,
    setInputConfig,
    filterStatus,
    setFilterStatus,
    filterDateOperator,
    setFilterDateOperator,
    filterDateValue,
    setFilterDateValue,
    inputDateValue,
    setInputDateValue,
    // Bulk Selection & Actions
    selectedUsers,
    setSelectedUsers,
    handleSelectAll,
    handleSelectUser,
    bulkActionConfig,
    setBulkActionConfig,
    isBulkActionLoading,
    isBulkConfirmOpen,
    setIsBulkConfirmOpen,
    handleBulkActionClick,
    exportSelectedUsersCsv,
    executeBulkAction,
    apiLicenseConfigs,
    // Single Actions
    licenseToDelete,
    isDeleteModalOpen,
    setIsDeleteModalOpen,
    actionType,
    isActionLoading,
    requestDelete,
    confirmSingleDelete,
    handlePrune,
    // Allocations
    billingAccountId,
    setBillingAccountId,
    billingConfigs,
    setBillingConfigs,
    projectNames,
    isBillingLoading,
    hasBillingPermission,
    setHasBillingPermission,
    availableBillingAccounts,
    isBillingAccountsLoading,
    distributeModalProps,
    setDistributeModalProps,
    retractModalProps,
    setRetractModalProps,
    fetchBillingConfigs,
    // Group Assignments
    groupServices: groupLicensing.groupServices,
    serviceToDelete: groupLicensing.serviceToDelete,
    setServiceToDelete: groupLicensing.setServiceToDelete,
    isDeletingService: groupLicensing.isDeletingService,
    isServicesLoading: groupLicensing.isServicesLoading,
    servicesError: groupLicensing.servicesError,
    selectedServiceForEdit: groupLicensing.selectedServiceForEdit,
    setSelectedServiceForEdit: groupLicensing.setSelectedServiceForEdit,
    lastRunTimes: groupLicensing.lastRunTimes,
    handleEditService: groupLicensing.handleEditService,
    handleRunService: groupLicensing.handleRunService,
    confirmDeleteService: groupLicensing.confirmDeleteService,
    fetchGroupServices: groupLicensing.fetchGroupServices,
    // Modals
    jsonModalData,
    setJsonModalData,
    isPruneModalOpen,
    setIsPruneModalOpen,
    isDeploymentModalOpen,
    setIsDeploymentModalOpen,
    isGroupDeploymentModalOpen: groupLicensing.isGroupDeploymentModalOpen,
    setIsGroupDeploymentModalOpen: groupLicensing.setIsGroupDeploymentModalOpen,
    isExportModalOpen,
    setIsExportModalOpen,
  };
}
