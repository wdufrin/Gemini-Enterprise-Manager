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
import { Config, GcsBucket } from '../types';
import * as api from '../services/apiService';
import { assertValidOpaqueId } from '../services/shellSafety';
import {
  generatePythonScript,
  generateRequirementsTxt,
  generateDeploySh,
  generateCloudbuildYaml,
  generateDeployCommand,
  generateGrantPermissionsCommand,
} from '../components/assistants/export/autoBackupTemplates';

declare let JSZip: any;

export function useExportMetrics(
  isOpen: boolean,
  config: Config,
  projectNumber: string,
  onBuildTriggered?: (buildId: string, projectId?: string) => void,
) {
  const [datasetId, setDatasetId] = useState('');
  const [tableId, setTableId] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Selection State
  const [datasets, setDatasets] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(false);
  const [isLoadingTables, setIsLoadingTables] = useState(false);

  // Creation State
  const [isCreationMode, setIsCreationMode] = useState(false);
  const [newDatasetId, setNewDatasetId] = useState('');
  const [newTableId, setNewTableId] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Auto-Backup State
  const [isAutoBackupMode, setIsAutoBackupMode] = useState(false);
  const [baseTableId, setBaseTableId] = useState('metrics_backup');
  const [backupDay, setBackupDay] = useState<number>(1);
  const [deployMethod, setDeployMethod] = useState<'gcloud' | 'cloud-build'>('gcloud');
  const [isPermissionsExpanded, setIsPermissionsExpanded] = useState(false);

  // Cloud Build State
  const [buckets, setBuckets] = useState<GcsBucket[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string>('');
  const [isLoadingBuckets, setIsLoadingBuckets] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  const bqLocation = config.appLocation === 'eu' ? 'EU' : 'US';
  const cfLocation = config.appLocation === 'eu' ? 'europe-west1' : 'us-central1';

  const fetchDatasets = useCallback(async () => {
    setIsLoadingDatasets(true);
    setError(null);
    try {
      const res = await api.listBigQueryDatasets(config.projectId);
      const validDatasets = (res.datasets || []).filter((d: any) => d.location === bqLocation);
      setDatasets(validDatasets);

      if (validDatasets.length === 0) {
        setIsCreationMode(true);
      }
    } catch (err: any) {
      console.error('Failed to list datasets', err);
    } finally {
      setIsLoadingDatasets(false);
    }
  }, [config.projectId, bqLocation]);

  const fetchTables = useCallback(
    async (selectedDatasetId: string) => {
      if (!selectedDatasetId) {
        setTables([]);
        return;
      }
      setIsLoadingTables(true);
      try {
        const res = await api.listBigQueryTables(config.projectId, selectedDatasetId);
        setTables(res.tables || []);
      } catch (err: any) {
        console.error('Failed to list tables', err);
        setTables([]);
      } finally {
        setIsLoadingTables(false);
      }
    },
    [config.projectId],
  );

  useEffect(() => {
    if (isOpen) {
      setDatasetId('');
      setTableId('');
      setStatus(null);
      setError(null);
      setNewDatasetId('');
      setNewTableId('');
      setIsCreationMode(false);
      setIsAutoBackupMode(false);
      setBaseTableId('metrics_backup');
      fetchDatasets();
    }
  }, [isOpen, fetchDatasets]);

  useEffect(() => {
    if (isOpen && isAutoBackupMode && deployMethod === 'cloud-build') {
      const fetchBuckets = async () => {
        setIsLoadingBuckets(true);
        try {
          const res = await api.listBuckets(config.projectId);
          const items = res.items || [];
          setBuckets(items);
          if (items.length > 0) {
            setSelectedBucket(items[0].name);
          }
        } catch (e) {
          console.error('Failed to fetch buckets', e);
        } finally {
          setIsLoadingBuckets(false);
        }
      };
      fetchBuckets();
    }
  }, [isOpen, isAutoBackupMode, deployMethod, config.projectId]);

  useEffect(() => {
    if (datasetId && !isCreationMode) {
      fetchTables(datasetId);
    } else {
      setTables([]);
    }
  }, [datasetId, isCreationMode, fetchTables]);

  const handleCreateResources = async () => {
    if (!newDatasetId && !newTableId) {
      setError('You must provide either a Dataset ID or a Table ID to create.');
      return;
    }

    setIsCreating(true);
    setError(null);
    setStatus('Creating resources...');

    try {
      if (newDatasetId) {
        try {
          await api.createBigQueryDataset(config.projectId, newDatasetId, bqLocation);
          setStatus('Dataset created.');
        } catch (err: any) {
          if (
            err.message &&
            (err.message.includes('Already Exists') || err.message.includes('409'))
          ) {
            console.log('Dataset already exists, proceeding.');
          } else {
            throw new Error(`Failed to create dataset: ${err.message}`);
          }
        }
      }

      const targetDataset = newDatasetId || datasetId;
      if (!targetDataset) {
        throw new Error('A dataset must be selected or created before creating a table.');
      }

      if (newTableId) {
        setStatus('Creating table...');
        await api.createBigQueryTable(config.projectId, targetDataset, newTableId);
      }

      await fetchDatasets();
      if (newDatasetId) {
        setDatasetId(newDatasetId);
        await fetchTables(newDatasetId);
      } else if (datasetId) {
        await fetchTables(datasetId);
      }

      if (newTableId) setTableId(newTableId);

      setIsCreationMode(false);
      setStatus('Resources created successfully! Ready to export.');
    } catch (err: any) {
      setError(err.message || 'Creation failed.');
      setStatus(null);
    } finally {
      setIsCreating(false);
    }
  };

  const handleExport = async () => {
    const targetDataset = datasetId;
    const targetTable = tableId;

    if (!targetDataset || !targetTable) {
      setError('Dataset ID and Table ID are required to export.');
      return;
    }
    setIsExporting(true);
    setError(null);
    setStatus('Initiating export...');

    try {
      const operation = await api.exportAnalyticsMetrics(config, targetDataset, targetTable);
      setStatus('Export initiated. Polling status...');

      let currentOperation = operation;
      while (!currentOperation.done) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        currentOperation = await api.getDiscoveryOperation(
          currentOperation.name,
          config,
          'v1alpha',
        );
        setStatus('Exporting metrics to BigQuery...');
      }

      if (currentOperation.error) {
        throw new Error(currentOperation.error.message);
      }

      setStatus('Success! Metrics exported to BigQuery.');
    } catch (err: any) {
      setError(err.message || 'Export failed.');
      setStatus(null);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCloudBuildDeploy = async () => {
    if (!selectedBucket) {
      setDeployError('Please select a bucket for staging.');
      return;
    }
    setIsDeploying(true);
    setDeployError(null);

    try {
      assertValidOpaqueId(config.projectId, 'Project ID');
      assertValidOpaqueId(projectNumber, 'Project number');
      assertValidOpaqueId(config.appLocation, 'App location');
      assertValidOpaqueId(config.collectionId, 'Collection ID');
      assertValidOpaqueId(config.appId, 'App ID');
      if (datasetId) assertValidOpaqueId(datasetId, 'BigQuery dataset');
      assertValidOpaqueId(baseTableId || 'metrics_backup', 'Base table name');
      if (!Number.isInteger(backupDay) || backupDay < 1 || backupDay > 28) {
        throw new Error(
          `Day of month must be a whole number between 1 and 28 (got "${backupDay}").`,
        );
      }

      const pythonScript = generatePythonScript(config, datasetId, baseTableId);
      const requirementsTxt = generateRequirementsTxt();
      const deploySh = generateDeploySh(backupDay);

      const zip = new JSZip();
      zip.file('main.py', pythonScript);
      zip.file('requirements.txt', requirementsTxt);
      zip.file('deploy.sh', deploySh);

      const blob = await zip.generateAsync({ type: 'blob' });
      const file = new File([blob], 'source.zip', { type: 'application/zip' });
      const sourceObjectName = `source/auto-backup-${Date.now()}.zip`;

      await api.uploadFileToGcs(selectedBucket, sourceObjectName, file, config.projectId);

      const buildConfig = {
        source: {
          storageSource: {
            bucket: selectedBucket,
            object: sourceObjectName,
          },
        },
        steps: [
          {
            name: 'gcr.io/google.com/cloudsdktool/cloud-sdk',
            entrypoint: 'bash',
            args: ['deploy.sh'],
            env: [
              `GOOGLE_CLOUD_PROJECT=${config.projectId}`,
              `PROJECT_ID=${config.projectId}`,
              `PROJECT_NUMBER=${projectNumber}`,
              `REGION=${cfLocation}`,
            ],
          },
        ],
        timeout: '600s',
        options: {
          logging: 'CLOUD_LOGGING_ONLY',
        },
      };

      const buildOp = await api.createCloudBuild(config.projectId, buildConfig);
      const triggeredBuildId = buildOp.metadata?.build?.id;

      if (triggeredBuildId) {
        if (onBuildTriggered) {
          onBuildTriggered(triggeredBuildId, config.projectId);
        }
        setStatus(`Cloud Build triggered successfully! Build ID: ${triggeredBuildId}`);
      } else {
        setStatus('Cloud Build triggered successfully, but Build ID was missing from response.');
      }
    } catch (err: any) {
      setDeployError(err.message || 'Failed to trigger Cloud Build.');
    } finally {
      setIsDeploying(false);
    }
  };

  const pythonScript = generatePythonScript(config, datasetId, baseTableId);
  const requirementsTxt = generateRequirementsTxt();
  const cloudbuildYaml = generateCloudbuildYaml(cfLocation, config.projectId, backupDay);
  const deployCommand = generateDeployCommand(
    deployMethod,
    cfLocation,
    config.projectId,
    backupDay,
  );
  const grantPermissionsCommand = generateGrantPermissionsCommand(
    config.projectId,
    projectNumber,
  );

  return {
    datasetId,
    setDatasetId,
    tableId,
    setTableId,
    isExporting,
    status,
    error,
    datasets,
    tables,
    isLoadingDatasets,
    isLoadingTables,
    isCreationMode,
    setIsCreationMode,
    newDatasetId,
    setNewDatasetId,
    newTableId,
    setNewTableId,
    isCreating,
    isAutoBackupMode,
    setIsAutoBackupMode,
    baseTableId,
    setBaseTableId,
    backupDay,
    setBackupDay,
    deployMethod,
    setDeployMethod,
    isPermissionsExpanded,
    setIsPermissionsExpanded,
    buckets,
    selectedBucket,
    setSelectedBucket,
    isLoadingBuckets,
    isDeploying,
    deployError,
    bqLocation,
    cfLocation,
    pythonScript,
    requirementsTxt,
    cloudbuildYaml,
    deployCommand,
    grantPermissionsCommand,
    handleCreateResources,
    handleExport,
    handleCloudBuildDeploy,
    fetchDatasets,
    fetchTables,
  };
}
