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
import { Config } from '../types';
import { toErrorMessage } from '../utils/errors';
import { useToast } from '../context/ToastContext';
import { CloudRunServiceItem } from '../components/license/types';

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
  const [selectedServiceForEdit, setSelectedServiceForEdit] = useState<any | null>(null);
  const [lastRunTimes, setLastRunTimes] = useState<Record<string, string>>({});
  const [isGroupDeploymentModalOpen, setIsGroupDeploymentModalOpen] = useState(false);

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
      } as any;

      const region = 'us-central1';
      const res = await api.listCloudRunServices(config, region);
      const items = res.services || [];

      const filtered = items.filter((s: any) => {
        const name = s.name || '';
        const parts = name.split('/');
        const id = parts[parts.length - 1];
        return id.startsWith('group-licensing-');
      });
      setGroupServices(filtered);

      filtered.forEach(async (service: any) => {
        const name = service.name || '';
        const parts = name.split('/');
        const id = parts[parts.length - 1];
        try {
          const logRes = await api.fetchLastRunLog(config, id);
          const entries = logRes.entries || [];
          if (entries.length > 0) {
            const timestamp = entries[0].timestamp;
            setLastRunTimes((prev) => ({ ...prev, [id]: timestamp }));
          }
        } catch (e) {
          console.error('Failed to fetch last run log for', id, e);
        }
      });
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
    if (containers.length > 0) {
      const env = containers[0].env || [];
      const configGcsUriEnv = env.find((e: any) => e.name === 'CONFIG_GCS_URI');
      if (configGcsUriEnv && configGcsUriEnv.value) {
        const gcsUri = configGcsUriEnv.value;
        if (gcsUri.startsWith('gs://')) {
          const parts = gcsUri.substring(5).split('/');
          const bucket = parts[0];
          const objectName = parts.slice(1).join('/');

          try {
            const content = await api.getGcsObjectContent(bucket, objectName, projectNumber);
            const parsedConfig = JSON.parse(content);
            setSelectedServiceForEdit(parsedConfig);
            setIsGroupDeploymentModalOpen(true);
          } catch (e) {
            console.error('Failed to fetch or parse config from GCS', e);
            toast.error('Failed to fetch or parse config from GCS: ' + toErrorMessage(e));
          }
        } else {
          toast.warning(`Invalid CONFIG_GCS_URI in service: "${gcsUri}". It must start with "gs://".`);
        }
      } else {
        toast.warning('No CONFIG_GCS_URI found in service environment variables.');
      }
    }
  };

  const handleRunService = async (serviceUrl?: string) => {
    if (!serviceUrl) {
      toast.warning('Service URL is not available.');
      return;
    }
    try {
      const resp = await api.gapiRequest<any>(serviceUrl, 'POST', projectNumber);
      toast.success(resp?.message || 'Job triggered.');
    } catch (err: unknown) {
      toast.error(`Error triggering service: ${toErrorMessage(err)}`);
    }
  };

  const confirmDeleteService = async () => {
    if (!serviceToDelete) return;
    setIsDeletingService(true);
    try {
      await api.deleteCloudRunService(serviceToDelete, { projectId: projectNumber } as any);
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
    isGroupDeploymentModalOpen,
    setIsGroupDeploymentModalOpen,
    fetchGroupServices,
    handleEditService,
    handleRunService,
    confirmDeleteService,
  };
}
