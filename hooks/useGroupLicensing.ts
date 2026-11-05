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

import { useState, useEffect, useCallback } from 'react';
import * as api from '../services/apiService';
import { Config, GroupLicensingEditConfig } from '../types';
import { toErrorMessage } from '../utils/errors';
import { useToast } from '../context/ToastContext';
import { CloudRunServiceItem, GroupLicensingRunReport } from '../components/license/types';
import { sanitizeCloudRunLabelValue } from '../components/license/GroupLicenseDeploymentModal';

export const SUPPORTED_GROUP_RUN_REGIONS = [
  'us-central1',
  'us-east1',
  'europe-west1',
  'asia-east1',
] as const;

const ALLOWED_APP_LOCATIONS = new Set(['global', 'us', 'eu']);

export function useGroupLicensing(
  projectNumber: string,
  appLocation: string,
  activeTab: string
) {
  const { toast } = useToast();

  const [groupServices, setGroupServices] = useState<CloudRunServiceItem[]>([]);
  const [serviceToDelete, setServiceToDelete] = useState<string | null>(null);
  const [isDeletingService, setIsDeletingService] = useState(false);
  const [isServicesLoading, setIsServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [selectedServiceForEdit, setSelectedServiceForEdit] = useState<GroupLicensingEditConfig | null>(null);
  const [lastRunTimes, setLastRunTimes] = useState<Record<string, string>>({});
  const [serviceGroups, setServiceGroups] = useState<Record<string, string[]>>({});
  const [isGroupDeploymentModalOpen, setIsGroupDeploymentModalOpen] = useState(false);
  const [runningServices, setRunningServices] = useState<Record<string, boolean>>({});
  const [serviceReports, setServiceReports] = useState<Record<string, GroupLicensingRunReport>>({});
  const [activeReport, setActiveReport] = useState<GroupLicensingRunReport | null>(null);

  const fetchGroupServices = useCallback(async () => {
    if (!projectNumber) return;
    setIsServicesLoading(true);
    setServicesError(null);
    try {
      const config: Config = {
        projectId: projectNumber,
        appLocation,
        collectionId: '',
        appId: '',
        assistantId: '',
      };

      const regionResults = await Promise.allSettled(
        SUPPORTED_GROUP_RUN_REGIONS.map((region) => api.listCloudRunServices(config, region))
      );

      const fulfilledItems: CloudRunServiceItem[] = [];
      let firstRejection: unknown = null;
      let anyFulfilled = false;

      for (const result of regionResults) {
        if (result.status === 'fulfilled') {
          anyFulfilled = true;
          const items = (result.value?.services || []) as CloudRunServiceItem[];
          fulfilledItems.push(...items);
        } else if (!firstRejection) {
          firstRejection = result.reason;
        }
      }

      if (!anyFulfilled && firstRejection) {
        throw firstRejection;
      }

      const filtered = fulfilledItems.filter((s) => {
        const name = s.name || '';
        const parts = name.split('/');
        const id = parts[parts.length - 1];
        return id.startsWith('group-licensing-');
      });
      setGroupServices(filtered);

      // Deduplicate CONFIG_GCS_URI fetches across discovered services to populate mapped Groups
      const gcsCache = new Map<string, Promise<GroupLicensingEditConfig | null>>();
      const getParsedGcsConfig = (gcsUri: string): Promise<GroupLicensingEditConfig | null> => {
        const existing = gcsCache.get(gcsUri);
        if (existing) return existing;
        const promise = (async () => {
          if (!gcsUri.startsWith('gs://') || typeof api.getGcsObjectContent !== 'function') return null;
          const uriParts = gcsUri.substring(5).split('/');
          const bucket = uriParts[0];
          const objectName = uriParts.slice(1).join('/');
          if (!bucket || !objectName) return null;
          try {
            const raw = await api.getGcsObjectContent(bucket, objectName, projectNumber);
            return JSON.parse(raw) as GroupLicensingEditConfig;
          } catch {
            return null;
          }
        })();
        gcsCache.set(gcsUri, promise);
        return promise;
      };

      await Promise.allSettled(
        filtered.map(async (service) => {
          const name = service.name || '';
          const parts = name.split('/');
          const serviceProject = parts[1] || projectNumber;
          const runRegion = parts[3] || 'us-central1';
          const id = parts[parts.length - 1];

          const env = service.template?.containers?.[0]?.env || [];
          const gcsUri = env.find((e) => e.name === 'CONFIG_GCS_URI')?.value?.trim();
          const envProject = env.find((e) => e.name === 'GOOGLE_CLOUD_PROJECT')?.value;
          const envLocation = env.find((e) => e.name === 'LOCATION')?.value || service.labels?.['ge-region'] || 'global';
          const envTier = env.find((e) => e.name === 'SUBSCRIPTION_TIER')?.value || service.labels?.['ge-sku'] || '';

          if (gcsUri) {
            const parsed = await getParsedGcsConfig(gcsUri);
            const projectsMap = parsed?.projects || {};
            const filterByLoc = (list?: Array<{ subscription_tier?: string; groups?: string[]; location?: string }>) =>
              (list || []).filter((e) => !e.location || e.location === envLocation);

            let locEntries = envProject && projectsMap[envProject] ? filterByLoc(projectsMap[envProject]) : [];
            if (locEntries.length === 0 && projectsMap[projectNumber]) {
              locEntries = filterByLoc(projectsMap[projectNumber]);
            }
            if (locEntries.length === 0) {
              const firstProjectEntries = Object.values(projectsMap)[0];
              locEntries = filterByLoc(firstProjectEntries);
            }

            const tierMatched = envTier
              ? locEntries.filter(
                  (e) =>
                    !e.subscription_tier ||
                    e.subscription_tier.toLowerCase() === envTier.toLowerCase() ||
                    sanitizeCloudRunLabelValue(e.subscription_tier) === sanitizeCloudRunLabelValue(envTier)
                )
              : locEntries;
            const effectiveEntries = tierMatched.length > 0 ? tierMatched : locEntries;
            const resolvedGroups = Array.from(
              new Set(effectiveEntries.flatMap((e) => e.groups || []).filter(Boolean))
            );
            if (resolvedGroups.length > 0) {
              setServiceGroups((prev) => ({ ...prev, [id]: resolvedGroups }));
            }
          }

          try {
            if (typeof api.getCloudSchedulerJob === 'function') {
              try {
                const jobStatus = await api.getCloudSchedulerJob(
                  serviceProject,
                  runRegion,
                  `trigger-${id}`,
                  projectNumber
                );
                if (jobStatus?.lastAttemptTime) {
                  setLastRunTimes((prev) => ({ ...prev, [id]: jobStatus.lastAttemptTime as string }));
                  return;
                }
              } catch {
                // Fall back to Cloud Logging if Cloud Scheduler status is unavailable
              }
            }
            const logRes = await api.fetchLastRunLog(config, id);
            const entries = logRes.entries || [];
            if (entries.length > 0 && entries[0].timestamp) {
              setLastRunTimes((prev) => ({ ...prev, [id]: entries[0].timestamp as string }));
            }
          } catch (e) {
            console.error('Failed to fetch last run log for', id, e);
          }
        })
      );
    } catch (e: unknown) {
      console.error('Failed to fetch group services', e);
      setServicesError('Failed to fetch group services: ' + toErrorMessage(e));
    } finally {
      setIsServicesLoading(false);
    }
  }, [projectNumber, appLocation]);

  useEffect(() => {
    if (activeTab === 'group_assignments' && projectNumber) {
      fetchGroupServices();
    }
  }, [activeTab, projectNumber, fetchGroupServices]);

  const handleEditService = async (service: CloudRunServiceItem) => {
    const containers = service.template?.containers || [];
    if (containers.length === 0) {
      toast.warning('No container configuration found on service.');
      return;
    }
    const env = containers[0].env || [];
    const configGcsUriEnv = env.find((e) => e.name === 'CONFIG_GCS_URI');
    if (!configGcsUriEnv || !configGcsUriEnv.value) {
      toast.warning('No CONFIG_GCS_URI found in service environment variables.');
      return;
    }

    const gcsUri = configGcsUriEnv.value.trim();
    if (!gcsUri.startsWith('gs://')) {
      toast.warning(`Invalid CONFIG_GCS_URI in service: "${gcsUri}". It must start with "gs://".`);
      return;
    }

    const parts = gcsUri.substring(5).split('/');
    const bucket = parts[0];
    const objectName = parts.slice(1).join('/');
    if (!bucket || !objectName) {
      toast.warning(`Invalid CONFIG_GCS_URI in service: "${gcsUri}". Missing bucket or object path.`);
      return;
    }

    const serviceNameParts = (service.name || '').split('/');
    const runRegion = serviceNameParts[3] || 'us-central1';
    const envProject = env.find((e) => e.name === 'GOOGLE_CLOUD_PROJECT')?.value;
    const envLocation = env.find((e) => e.name === 'LOCATION')?.value;
    const envUserStoreId = env.find((e) => e.name === 'USER_STORE_ID')?.value;
    const envTier = env.find((e) => e.name === 'SUBSCRIPTION_TIER')?.value;
    const labelLocation = service.labels?.['ge-region'];
    const labelSku = service.labels?.['ge-sku'];
    const rawLocation = envLocation || labelLocation || appLocation || 'global';
    const safeLocation = ALLOWED_APP_LOCATIONS.has(rawLocation) ? rawLocation : 'global';

    try {
      const content = await api.getGcsObjectContent(bucket, objectName, projectNumber);
      const parsedConfig = JSON.parse(content) as GroupLicensingEditConfig;
      const enrichedConfig: GroupLicensingEditConfig = {
        ...parsedConfig,
        _editMeta: {
          runRegion,
          bucket,
          sku: envTier || labelSku,
          location: safeLocation,
          userStoreId: envUserStoreId || 'default_user_store',
          projectId: envProject || serviceNameParts[1] || projectNumber,
        },
      };
      setSelectedServiceForEdit(enrichedConfig);
      setIsGroupDeploymentModalOpen(true);
    } catch (e) {
      console.error('Failed to fetch or parse config from GCS', e);
      toast.error('Failed to fetch or parse config from GCS: ' + toErrorMessage(e));
    }
  };

  const extractServiceMeta = (service: CloudRunServiceItem) => {
    const parts = (service.name || '').split('/');
    const serviceProject = parts[1] || projectNumber;
    const runRegion = parts[3] || 'us-central1';
    const serviceId = parts[parts.length - 1];
    const jobId = `trigger-${serviceId}`;
    const env = service.template?.containers?.[0]?.env || [];
    const labels = service.labels || {};
    const defaultTier = env.find((e) => e.name === 'SUBSCRIPTION_TIER')?.value || labels['ge-sku'] || '';
    const defaultLocation = env.find((e) => e.name === 'LOCATION')?.value || labels['ge-region'] || appLocation || 'global';
    const defaultJobType =
      env.find((e) => e.name === 'JOB_TYPE')?.value ||
      labels['job-type'] ||
      (serviceId.includes('cleanup') ? 'cleanup' : 'adder');

    return {
      serviceProject,
      runRegion,
      serviceId,
      jobId,
      defaultTier,
      defaultLocation,
      defaultJobType,
    };
  };

  const handleViewServiceReport = async (service: CloudRunServiceItem) => {
    if (!service?.name) {
      toast.warning('Service resource name is required to load its report.');
      return;
    }

    const {
      serviceProject,
      runRegion,
      serviceId,
      jobId,
      defaultTier,
      defaultLocation,
      defaultJobType,
    } = extractServiceMeta(service);

    setRunningServices((prev) => ({ ...prev, [serviceId]: true }));
    try {
      const report = await api.fetchGroupLicensingRunReport({
        projectId: serviceProject,
        quotaProjectId: projectNumber,
        region: runRegion,
        serviceId,
        serviceName: service.name,
        jobId,
        defaultJobType,
        defaultLocation,
        defaultTier,
        waitForCompletion: false,
      });

      if (report) {
        setServiceReports((prev) => ({ ...prev, [serviceId]: report }));
        setActiveReport(report);
        if (report.timestamp) {
          setLastRunTimes((prev) => ({ ...prev, [serviceId]: report.timestamp }));
        }
      } else {
        toast.info(`No execution logs found yet for "${serviceId}".`);
      }
    } catch (err: unknown) {
      toast.error(`Failed to load execution report: ${toErrorMessage(err)}`);
    } finally {
      setRunningServices((prev) => ({ ...prev, [serviceId]: false }));
    }
  };

  const handleRunService = async (serviceOrUrl?: CloudRunServiceItem | string) => {
    const service = typeof serviceOrUrl === 'object' && serviceOrUrl !== null ? serviceOrUrl : undefined;
    const serviceUrl =
      typeof serviceOrUrl === 'string'
        ? serviceOrUrl
        : service?.uri || service?.status?.url;

    if (!serviceUrl && !service?.name) {
      toast.warning('Service URL is not available.');
      return;
    }

    if (!service?.name) {
      toast.warning('Service resource name is required to trigger its Cloud Scheduler job.');
      return;
    }

    const {
      serviceProject,
      runRegion,
      serviceId,
      jobId,
      defaultTier,
      defaultLocation,
      defaultJobType,
    } = extractServiceMeta(service);
    const saEmail = service.template?.serviceAccount;
    const triggerStartTime = new Date(Date.now() - 5000).toISOString();

    setRunningServices((prev) => ({ ...prev, [serviceId]: true }));
    try {
      if (saEmail) {
        try {
          await api.ensureCloudRunInvokerRole(service.name, saEmail, projectNumber);
        } catch (iamErr: unknown) {
          console.warn('Could not verify/update Cloud Run invoker IAM policy:', iamErr);
        }
      }

      await api.triggerCloudRunServiceJob({
        projectId: serviceProject,
        quotaProjectId: projectNumber,
        region: runRegion,
        jobId,
        serviceUrl,
        serviceAccountEmail: saEmail,
      });

      toast.success(`Triggered job "${jobId}".`);
      const nowIso = new Date().toISOString();
      setLastRunTimes((prev) => ({ ...prev, [serviceId]: nowIso }));

      if (typeof api.fetchGroupLicensingRunReport === 'function') {
        try {
          const report = await api.fetchGroupLicensingRunReport({
            projectId: serviceProject,
            quotaProjectId: projectNumber,
            region: runRegion,
            serviceId,
            serviceName: service.name,
            jobId,
            sinceTimestamp: triggerStartTime,
            defaultJobType,
            defaultLocation,
            defaultTier,
            waitForCompletion: true,
            onProgress: (partialReport) => {
              setServiceReports((prev) => ({ ...prev, [serviceId]: partialReport }));
              setActiveReport(partialReport);
            },
          });
          if (report) {
            setServiceReports((prev) => ({ ...prev, [serviceId]: report }));
            setActiveReport(report);
            if (report.timestamp) {
              setLastRunTimes((prev) => ({ ...prev, [serviceId]: report.timestamp }));
            }
            if (report.status === 'aborted') {
              toast.warning(`Job "${jobId}" was aborted by safety guard: ${report.message}`);
            } else if (report.status === 'error') {
              toast.error(`Job "${jobId}" reported errors: ${report.message}`);
            }
          }
        } catch (reportErr: unknown) {
          console.warn('Could not fetch post-run execution report:', reportErr);
        }
      }
    } catch (err: unknown) {
      toast.error(`Error triggering service: ${toErrorMessage(err)}`);
    } finally {
      setRunningServices((prev) => ({ ...prev, [serviceId]: false }));
    }
  };

  // Auto-refresh activeReport in the background if a cold-start run is still in 'running' state after the initial poll window
  useEffect(() => {
    if (
      !activeReport ||
      activeReport.status !== 'running' ||
      Boolean(runningServices[activeReport.serviceId]) ||
      typeof api.fetchGroupLicensingRunReport !== 'function'
    ) {
      return;
    }

    const parts = (activeReport.serviceName || '').split('/');
    const serviceProject = parts[1] || projectNumber;
    const runRegion = parts[3] || 'us-central1';
    const serviceId = activeReport.serviceId;
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const refreshed = await api.fetchGroupLicensingRunReport({
          projectId: serviceProject,
          quotaProjectId: projectNumber,
          region: runRegion,
          serviceId,
          serviceName: activeReport.serviceName,
          jobId: `trigger-${serviceId}`,
          defaultJobType: activeReport.jobType,
          defaultLocation: activeReport.location,
          defaultTier: activeReport.subscriptionTier,
          waitForCompletion: false,
        });
        if (!cancelled && refreshed) {
          setServiceReports((prev) => ({ ...prev, [serviceId]: refreshed }));
          setActiveReport(refreshed);
          if (refreshed.timestamp) {
            setLastRunTimes((prev) => ({ ...prev, [serviceId]: refreshed.timestamp }));
          }
        }
      } catch (pollErr: unknown) {
        console.debug('Background report refresh failed:', pollErr);
      }
    }, 3000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeReport, runningServices, projectNumber]);

  const confirmDeleteService = async () => {
    if (!serviceToDelete) return;
    setIsDeletingService(true);
    try {
      const parts = serviceToDelete.split('/');
      const serviceProject = parts[1] || projectNumber;
      const runRegion = parts[3] || 'us-central1';
      const serviceId = parts[parts.length - 1];

      await api.deleteCloudRunService(serviceToDelete, { projectId: projectNumber } as Config);

      if (serviceId && typeof api.deleteCloudSchedulerJob === 'function') {
        try {
          await api.deleteCloudSchedulerJob(
            serviceProject,
            runRegion,
            `trigger-${serviceId}`,
            projectNumber
          );
        } catch (schedErr: unknown) {
          console.warn('Could not delete paired Cloud Scheduler job:', schedErr);
        }
      }

      await fetchGroupServices();
      setServiceToDelete(null);
    } catch (err: unknown) {
      toast.error('Failed to delete service: ' + toErrorMessage(err));
    } finally {
      setIsDeletingService(false);
    }
  };

  return {
    groupServices,
    serviceToDelete,
    setServiceToDelete,
    isDeletingService,
    isServicesLoading,
    servicesError,
    selectedServiceForEdit,
    setSelectedServiceForEdit,
    lastRunTimes,
    serviceGroups,
    isGroupDeploymentModalOpen,
    setIsGroupDeploymentModalOpen,
    runningServices,
    serviceReports,
    activeReport,
    setActiveReport,
    fetchGroupServices,
    handleEditService,
    handleRunService,
    handleViewServiceReport,
    confirmDeleteService,
  };
}
