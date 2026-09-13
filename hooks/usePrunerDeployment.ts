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

import { useState, useEffect } from 'react';
import { GcsBucket } from '../types';
import * as api from '../services/apiService';
import {
  assertValidGcpResourceName,
  assertValidOpaqueId,
  assertValidProjectIdentifier,
  assertValidServiceAccountEmail,
} from '../services/shellSafety';
import { toErrorMessage } from '../utils/errors';
import {
  generateMainPy,
  generateDeploySh,
  requirementsTxt,
  dockerfile,
} from '../components/license/pruner/prunerTemplates';

declare let JSZip: any;

export function usePrunerDeployment(
  isOpen: boolean,
  onClose: () => void,
  projectNumber: string,
  currentConfig: { appLocation: string; userStoreId: string },
  onBuildTriggered?: (buildId: string) => void,
) {
  const [config, setConfig] = useState({
    projectId: projectNumber,
    runRegion: 'us-central1',
    appLocation: currentConfig.appLocation || 'global',
    userStoreId: currentConfig.userStoreId || 'default_user_store',
    pruneDays: 30 as number | '',
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customSaEmail, setCustomSaEmail] = useState('');
  const [isCheckingPermissions, setIsCheckingPermissions] = useState(false);
  const [permissionCheckResult, setPermissionCheckResult] = useState<{
    status: 'success' | 'error' | null;
    message: string;
  }>({ status: null, message: '' });
  const [skipIamInScript, setSkipIamInScript] = useState(false);

  const [activeTab, setActiveTab] = useState<'deploy' | 'main' | 'requirements'>('deploy');
  const [copySuccess, setCopySuccess] = useState('');
  const [isResolvingId, setIsResolvingId] = useState(false);

  const [buckets, setBuckets] = useState<GcsBucket[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string>('');
  const [isLoadingBuckets, setIsLoadingBuckets] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  const [isPermissionsExpanded, setIsPermissionsExpanded] = useState(true);
  const [hasGrantedPermissions, setHasGrantedPermissions] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setConfig((prev) => ({
        ...prev,
        appLocation: currentConfig.appLocation || 'global',
        userStoreId: currentConfig.userStoreId || 'default_user_store',
      }));

      if (projectNumber) {
        setIsResolvingId(true);
        api
          .getProject(projectNumber)
          .then((details) => {
            if (details.projectId) {
              setConfig((prev) => ({ ...prev, projectId: details.projectId }));
            }
          })
          .catch((err) => console.warn('Failed to auto-resolve project ID:', err))
          .finally(() => setIsResolvingId(false));
      }
    }
  }, [isOpen, currentConfig, projectNumber]);

  useEffect(() => {
    if (!isOpen || !config.projectId) return;

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
  }, [isOpen, config.projectId]);

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopySuccess('Copied!');
      setTimeout(() => setCopySuccess(''), 2000);
    });
  };

  const handleCheckPermissions = async () => {
    if (!customSaEmail || !config.projectId) return;
    setIsCheckingPermissions(true);
    setPermissionCheckResult({ status: null, message: '' });
    setSkipIamInScript(false);

    const REQUIRED_ROLES = [
      'roles/discoveryengine.admin',
      'roles/logging.logWriter',
      'roles/serviceusage.serviceUsageConsumer',
    ];

    try {
      const result = await api.checkServiceAccountPermissions(
        config.projectId,
        customSaEmail,
        REQUIRED_ROLES,
      );
      if (result.hasAll) {
        setPermissionCheckResult({
          status: 'success',
          message: 'All required permissions are present.',
        });
        setSkipIamInScript(true);
      } else {
        setPermissionCheckResult({
          status: 'error',
          message: `Missing roles: ${result.missing.join(', ')}. The deployment script will attempt to grant them.`,
        });
        setSkipIamInScript(false);
      }
    } catch (err: unknown) {
      setPermissionCheckResult({
        status: 'error',
        message: `Check failed: ${toErrorMessage(err)}`,
      });
      setSkipIamInScript(false);
    } finally {
      setIsCheckingPermissions(false);
    }
  };

  const pruneDaysVal = typeof config.pruneDays === 'number' ? config.pruneDays : 30;
  const mainPy = generateMainPy(pruneDaysVal, config.appLocation, config.userStoreId);
  const deploySh = generateDeploySh(
    config.projectId,
    config.appLocation,
    config.userStoreId,
    pruneDaysVal,
    config.runRegion,
    customSaEmail.trim() || undefined,
    skipIamInScript,
  );

  const validateDeploymentInputs = () => {
    assertValidProjectIdentifier(config.projectId, 'Project ID');
    assertValidGcpResourceName(config.runRegion, 'Run region');
    assertValidGcpResourceName(config.appLocation, 'App location');
    assertValidOpaqueId(config.userStoreId, 'User Store ID');
    if (customSaEmail.trim()) {
      assertValidServiceAccountEmail(customSaEmail, 'Service account');
    }
  };

  const handleDownload = async () => {
    try {
      validateDeploymentInputs();
    } catch (err: unknown) {
      setDeployError(toErrorMessage(err, 'Invalid deployment configuration.'));
      return;
    }

    const zip = new JSZip();
    zip.file('main.py', mainPy);
    zip.file('deploy.sh', deploySh);
    zip.file('requirements.txt', requirementsTxt);
    zip.file('Dockerfile', dockerfile);
    zip.file(
      'README.md',
      '# License Pruner\n\nRun `./deploy.sh` to deploy to Cloud Run and schedule the job.',
    );

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `license-pruner-source.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCloudBuildDeploy = async () => {
    if (!selectedBucket) {
      setDeployError('Please select a bucket for staging.');
      return;
    }
    setIsDeploying(true);
    setDeployError(null);

    try {
      validateDeploymentInputs();

      const zip = new JSZip();
      zip.file('main.py', mainPy);
      zip.file('deploy.sh', deploySh);
      zip.file('requirements.txt', requirementsTxt);
      zip.file('Dockerfile', dockerfile);

      const blob = await zip.generateAsync({ type: 'blob' });
      const file = new File([blob], 'source.zip', { type: 'application/zip' });
      const sourceObjectName = `source/license-pruner-${Date.now()}.zip`;

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
            env: [`GOOGLE_CLOUD_PROJECT=${config.projectId}`],
          },
        ],
        timeout: '600s',
      };

      const buildOp = await api.createCloudBuild(config.projectId, buildConfig);
      const buildId = buildOp.metadata?.build?.id;

      if (onBuildTriggered && buildId) {
        onBuildTriggered(buildId);
      }

      onClose();
    } catch (err: unknown) {
      setDeployError(toErrorMessage(err, 'Failed to trigger Cloud Build.'));
    } finally {
      setIsDeploying(false);
    }
  };

  const cloudBuildSa = `${projectNumber}@cloudbuild.gserviceaccount.com`;
  const grantPermissionsCommand = `gcloud projects add-iam-policy-binding ${config.projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/resourcemanager.projectIamAdmin"

gcloud projects add-iam-policy-binding ${config.projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/iam.serviceAccountAdmin"

gcloud projects add-iam-policy-binding ${config.projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding ${config.projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/cloudscheduler.admin"

gcloud projects add-iam-policy-binding ${config.projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding ${config.projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/serviceusage.serviceUsageConsumer"`;

  return {
    config,
    setConfig,
    showAdvanced,
    setShowAdvanced,
    customSaEmail,
    setCustomSaEmail,
    isCheckingPermissions,
    permissionCheckResult,
    skipIamInScript,
    activeTab,
    setActiveTab,
    copySuccess,
    isResolvingId,
    buckets,
    selectedBucket,
    setSelectedBucket,
    isLoadingBuckets,
    isDeploying,
    deployError,
    isPermissionsExpanded,
    setIsPermissionsExpanded,
    hasGrantedPermissions,
    setHasGrantedPermissions,
    mainPy,
    deploySh,
    requirementsTxt,
    grantPermissionsCommand,
    handleCopy,
    handleCheckPermissions,
    handleDownload,
    handleCloudBuildDeploy,
  };
}
