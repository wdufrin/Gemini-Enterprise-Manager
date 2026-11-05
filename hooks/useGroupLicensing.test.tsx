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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act, waitFor } from '@testing-library/react';
import { useGroupLicensing, SUPPORTED_GROUP_RUN_REGIONS } from './useGroupLicensing';
import { GroupAssignmentsTab } from '../components/license/GroupAssignmentsTab';
import GroupLicenseDeploymentModal, {
  generateDeploySh,
  sanitizeCloudRunLabelValue,
} from '../components/license/GroupLicenseDeploymentModal';
import mainPyTemplate from '../components/license/main.py.template?raw';
import { CloudRunServiceItem } from '../components/license/types';
import * as api from '../services/apiService';
import * as core from '../services/api/core';
import { GapiError, getDiscoveryEngineUrl } from '../services/api/core';
import { ensureCloudRunInvokerRole, triggerCloudRunServiceJob } from '../services/api/cloudRun';

const toastMock = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ toast: toastMock }),
}));

describe('useGroupLicensing & Cloud Run group licensing trigger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    toastMock.warning.mockReset();
    toastMock.info.mockReset();
  });

  it('passes the full CloudRunServiceItem from GroupAssignmentsTab when Run is clicked', () => {
    const onRunService = vi.fn();
    const service: CloudRunServiceItem = {
      name: 'projects/ancient-sandbox-322523/locations/us-central1/services/group-licensing-adder-global',
      uri: 'https://group-licensing-adder-global-abc123-uc.a.run.app',
      labels: {
        'ge-region': 'global',
        'ge-sku': 'internal_gemini_ent_plus',
        'job-type': 'adder',
      },
      template: {
        serviceAccount: 'license-grouper-sa@ancient-sandbox-322523.iam.gserviceaccount.com',
      },
    };

    render(
      <GroupAssignmentsTab
        isServicesLoading={false}
        servicesError={null}
        groupServices={[service]}
        lastRunTimes={{}}
        apiLicenseConfigs={[]}
        onNewAssignment={vi.fn()}
        onRunService={onRunService}
        onEditService={vi.fn()}
        onDeleteService={vi.fn()}
      />,
    );

    const runBtn = screen.getByRole('button', { name: 'Run' });
    fireEvent.click(runBtn);

    expect(onRunService).toHaveBeenCalledTimes(1);
    expect(onRunService).toHaveBeenCalledWith(service);
  });

  it('triggers the paired Cloud Scheduler job and heals missing roles/run.invoker for Cloud Run v2 services', async () => {
    const ensureInvokerSpy = vi
      .spyOn(api, 'ensureCloudRunInvokerRole')
      .mockResolvedValue(undefined);
    const triggerJobSpy = vi
      .spyOn(api, 'triggerCloudRunServiceJob')
      .mockResolvedValue({ name: 'projects/ancient-sandbox-322523/locations/us-central1/jobs/trigger-group-licensing-adder-global' });

    const { result } = renderHook(() =>
      useGroupLicensing('180054373655', 'global', 'user_licenses'),
    );

    const v2Service: CloudRunServiceItem = {
      name: 'projects/ancient-sandbox-322523/locations/us-central1/services/group-licensing-adder-global',
      uri: 'https://group-licensing-adder-global-abc123-uc.a.run.app',
      template: {
        serviceAccount: 'license-grouper-sa@ancient-sandbox-322523.iam.gserviceaccount.com',
      },
    };

    await act(async () => {
      await result.current.handleRunService(v2Service);
    });

    expect(ensureInvokerSpy).toHaveBeenCalledWith(
      v2Service.name,
      'license-grouper-sa@ancient-sandbox-322523.iam.gserviceaccount.com',
      '180054373655',
    );
    expect(triggerJobSpy).toHaveBeenCalledWith({
      projectId: 'ancient-sandbox-322523',
      quotaProjectId: '180054373655',
      region: 'us-central1',
      jobId: 'trigger-group-licensing-adder-global',
      serviceUrl: 'https://group-licensing-adder-global-abc123-uc.a.run.app',
      serviceAccountEmail: 'license-grouper-sa@ancient-sandbox-322523.iam.gserviceaccount.com',
    });
    expect(toastMock.warning).not.toHaveBeenCalled();
    expect(toastMock.success).toHaveBeenCalledWith(
      'Triggered job "trigger-group-licensing-adder-global".',
    );
    expect(result.current.lastRunTimes['group-licensing-adder-global']).toBeDefined();
  });

  it('rejects empty/missing service input or raw string URL without leaking Bearer token via gapiRequest (P1-5)', async () => {
    const triggerJobSpy = vi.spyOn(api, 'triggerCloudRunServiceJob');
    const gapiSpy = vi.spyOn(core, 'gapiRequest');

    const { result } = renderHook(() =>
      useGroupLicensing('180054373655', 'global', 'user_licenses'),
    );

    await act(async () => {
      await result.current.handleRunService(undefined);
      await result.current.handleRunService({ name: '' });
      await result.current.handleRunService('https://evil.example.com/steal-token');
    });

    expect(toastMock.warning).toHaveBeenCalledTimes(3);
    expect(triggerJobSpy).not.toHaveBeenCalled();
    expect(gapiSpy).not.toHaveBeenCalled();
  });

  it('surfaces an error toast when Cloud Scheduler trigger fails with 403 PERMISSION_DENIED', async () => {
    vi.spyOn(api, 'ensureCloudRunInvokerRole').mockResolvedValue(undefined);
    vi.spyOn(api, 'triggerCloudRunServiceJob').mockRejectedValue(
      new GapiError('Cloud Scheduler API has not been used in project', 403, 'PERMISSION_DENIED'),
    );

    const { result } = renderHook(() =>
      useGroupLicensing('180054373655', 'global', 'user_licenses'),
    );

    await act(async () => {
      await result.current.handleRunService({
        name: 'projects/ancient-sandbox-322523/locations/us-central1/services/group-licensing-cleanup-global',
        uri: 'https://group-licensing-cleanup-global-abc123-uc.a.run.app',
      });
    });

    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith(
      expect.stringContaining('Cloud Scheduler API has not been used in project'),
    );
  });

  it('auto-creates the Cloud Scheduler HTTP job and retries :run when the job returns 404 NOT_FOUND', async () => {
    const gapiSpy = vi
      .spyOn(core, 'gapiRequest')
      .mockRejectedValueOnce(new GapiError('Job not found', 404, 'NOT_FOUND'))
      .mockResolvedValueOnce({ name: 'projects/my-proj/locations/us-central1/jobs/trigger-group-licensing-cleanup-global' })
      .mockResolvedValueOnce({ state: 'ENABLED' });

    const res = await triggerCloudRunServiceJob({
      projectId: 'my-proj',
      quotaProjectId: '180054373655',
      region: 'us-central1',
      jobId: 'trigger-group-licensing-cleanup-global',
      serviceUrl: 'https://group-licensing-cleanup-global-xyz.a.run.app',
      serviceAccountEmail: 'license-grouper-sa@my-proj.iam.gserviceaccount.com',
    });

    expect(res).toEqual({ state: 'ENABLED' });
    expect(gapiSpy).toHaveBeenCalledTimes(3);
    expect(gapiSpy).toHaveBeenNthCalledWith(
      1,
      'https://cloudscheduler.googleapis.com/v1/projects/my-proj/locations/us-central1/jobs/trigger-group-licensing-cleanup-global:run',
      'POST',
      '180054373655',
      undefined,
      {},
    );
    expect(gapiSpy).toHaveBeenNthCalledWith(
      2,
      'https://cloudscheduler.googleapis.com/v1/projects/my-proj/locations/us-central1/jobs',
      'POST',
      '180054373655',
      undefined,
      expect.objectContaining({
        name: 'projects/my-proj/locations/us-central1/jobs/trigger-group-licensing-cleanup-global',
        schedule: '0 */6 * * *',
        attemptDeadline: '1800s',
        retryConfig: { retryCount: 2, minBackoffDuration: '600s' },
        httpTarget: {
          uri: 'https://group-licensing-cleanup-global-xyz.a.run.app',
          httpMethod: 'POST',
          oidcToken: {
            serviceAccountEmail: 'license-grouper-sa@my-proj.iam.gserviceaccount.com',
          },
        },
      }),
    );
  });

  it('rethrows 404 from triggerCloudRunServiceJob when serviceUrl or serviceAccountEmail is missing', async () => {
    vi.spyOn(core, 'gapiRequest').mockRejectedValueOnce(
      new GapiError('Job not found', 404, 'NOT_FOUND'),
    );

    await expect(
      triggerCloudRunServiceJob({
        projectId: 'my-proj',
        quotaProjectId: '180054373655',
        region: 'us-central1',
        jobId: 'trigger-group-licensing-adder-global',
      }),
    ).rejects.toThrow('Job not found');
  });

  it('adds roles/run.invoker only when the service account is not already bound in Cloud Run IAM policy', async () => {
    const gapiSpy = vi
      .spyOn(core, 'gapiRequest')
      .mockResolvedValueOnce({ etag: 'etag-1', bindings: [] })
      .mockResolvedValueOnce({ etag: 'etag-2' });

    await ensureCloudRunInvokerRole(
      'projects/my-proj/locations/us-central1/services/group-licensing-adder-global',
      'license-grouper-sa@my-proj.iam.gserviceaccount.com',
      '180054373655',
    );

    expect(gapiSpy).toHaveBeenCalledTimes(2);
    expect(gapiSpy).toHaveBeenNthCalledWith(
      2,
      'https://us-central1-run.googleapis.com/v2/projects/my-proj/locations/us-central1/services/group-licensing-adder-global:setIamPolicy',
      'POST',
      '180054373655',
      undefined,
      {
        policy: {
          etag: 'etag-1',
          bindings: [
            {
              role: 'roles/run.invoker',
              members: ['serviceAccount:license-grouper-sa@my-proj.iam.gserviceaccount.com'],
            },
          ],
        },
      },
    );
  });

  it('P0-1 & P1-6: lowercases Cloud Run ge-sku label while preserving exact SUBSCRIPTION_TIER env var and scoping GCS IAM to bucket', () => {
    expect(sanitizeCloudRunLabelValue('SUBSCRIPTION_TIER_ENTERPRISE')).toBe(
      'subscription_tier_enterprise',
    );

    const script = generateDeploySh(
      'my-project-123',
      'global',
      'default_user_store',
      'us-central1',
      'gs://my-staging-bucket/config/entitlements.json',
      'SUBSCRIPTION_TIER_ENTERPRISE',
      '',
      '180054373655',
    );

    expect(script).toContain(
      '--labels="ge-region=global,ge-sku=subscription_tier_enterprise,job-type=adder"',
    );
    expect(script).toContain('SUBSCRIPTION_TIER=SUBSCRIPTION_TIER_ENTERPRISE');
    const count = (needle: string) => script.split(needle).length - 1;
    // Both Cloud Run services: 30-minute timeout, single instance, one request at a time.
    expect(count('--timeout=1800 ')).toBe(2);
    expect(count('--max-instances=1 ')).toBe(2);
    expect(count('--concurrency=1 ')).toBe(2);
    expect(script).not.toContain('--timeout=540');
    // All four Scheduler create/update commands: 1800s deadline and two retries.
    expect(count('--attempt-deadline=1800s ')).toBe(4);
    expect(count('--max-retry-attempts=2 ')).toBe(4);
    expect(count('--min-backoff=600s ')).toBe(4);
    expect(script).not.toContain('--attempt-deadline=540s');
    expect(script).toContain(
      'JOB_TYPE=cleanup,PROJECT_NUMBER=180054373655,MAX_REVOCATION_PERCENT=5,MIN_REVOCATION_ALLOWANCE=50"',
    );
    expect(script).toContain(
      'gcloud storage buckets add-iam-policy-binding gs://my-staging-bucket --member="serviceAccount:$SA_EMAIL" --role="roles/storage.objectViewer"',
    );
    expect(script).not.toContain('--role="roles/storage.objectViewer" --condition=None');
  });

  it('generates a deploy.sh that bash parses without syntax errors', async () => {
    const { execFileSync } = await import('node:child_process');
    const script = generateDeploySh(
      'my-project-123',
      'global',
      'default_user_store',
      'us-central1',
      'gs://my-staging-bucket/config/entitlements.json',
      'SUBSCRIPTION_TIER_ENTERPRISE',
      '',
      '180054373655',
    );
    // `bash -n` parses without executing; a broken line continuation or quote makes it exit non-zero.
    expect(() => execFileSync('bash', ['-n'], { input: script, encoding: 'utf-8' })).not.toThrow();
    expect(() =>
      execFileSync('bash', ['-n'], { input: script.replace('--min-backoff=600s \\\n', '--min-backoff=600s \\\n"'), encoding: 'utf-8', stdio: 'pipe' }),
    ).toThrow();
  });

  it('main.py.template behavioral harness: operation polling, end-state verification, seat limits, safety guards, retries, dry run, and 10k-user scale', async () => {
    const { execFileSync } = await import('node:child_process');
    // Runs the real template functions against a stateful fake of the Directory and license APIs
    // (components/license/main_template_harness.py). The harness exits non-zero if any check fails.
    let out = '';
    try {
      out = execFileSync('python3', ['components/license/main_template_harness.py'], {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });
    } catch (err: unknown) {
      const stdout = (err as { stdout?: string }).stdout ?? '';
      throw new Error(`main_template_harness.py failed:\n${stdout}`);
    }
    expect(out).toMatch(/HARNESS: \d+ passed \/ 0 failed \/ 0 skipped/);
    expect(out).not.toContain('[FAIL]');
    expect(out).toContain('PYTHON_HARNESS_OK');
  }, 30_000);

  it('P0-3: getDiscoveryEngineUrl rejects malicious SSRF hostnames and handleEditService sanitizes untrusted location', async () => {
    expect(getDiscoveryEngineUrl('global')).toBe('https://discoveryengine.googleapis.com');
    expect(getDiscoveryEngineUrl('us')).toBe('https://us-discoveryengine.googleapis.com');
    expect(() => getDiscoveryEngineUrl('evil.example.com#')).toThrow(
      /Invalid Discovery Engine location/,
    );
    expect(() => getDiscoveryEngineUrl('https://attacker.tld/')).toThrow(
      /Invalid Discovery Engine location/,
    );

    vi.spyOn(api, 'getGcsObjectContent').mockResolvedValueOnce(
      JSON.stringify({
        billing_account_id: '012345-6789AB-CDEF01',
        projects: {
          'ancient-sandbox-322523': [
            {
              subscription_tier: 'SUBSCRIPTION_TIER_ENTERPRISE',
              location: 'evil.example.com#',
              groups: ['eng@example.com'],
            },
          ],
        },
      }),
    );

    const { result } = renderHook(() =>
      useGroupLicensing('180054373655', 'global', 'user_licenses'),
    );

    await act(async () => {
      await result.current.handleEditService({
        name: 'projects/ancient-sandbox-322523/locations/europe-west1/services/group-licensing-adder-global',
        labels: { 'ge-region': 'evil.example.com#', 'ge-sku': 'subscription_tier_enterprise' },
        template: {
          containers: [
            {
              env: [
                { name: 'CONFIG_GCS_URI', value: 'gs://my-bucket/config/entitlements.json' },
                { name: 'LOCATION', value: 'evil.example.com#' },
                { name: 'SUBSCRIPTION_TIER', value: 'SUBSCRIPTION_TIER_ENTERPRISE' },
              ],
            },
          ],
        },
      });
    });

    expect(result.current.selectedServiceForEdit?._editMeta).toEqual({
      runRegion: 'europe-west1',
      bucket: 'my-bucket',
      sku: 'SUBSCRIPTION_TIER_ENTERPRISE',
      location: 'global',
      userStoreId: 'default_user_store',
      projectId: 'ancient-sandbox-322523',
    });
  });

  it('P1-4 & P2-1: fetchGroupServices queries all 4 regions, resolves serviceGroups from GCS, and confirmDeleteService deletes paired Cloud Scheduler job', async () => {
    const listServicesSpy = vi
      .spyOn(api, 'listCloudRunServices')
      .mockImplementation(async (_cfg, region) => {
        if (region === 'europe-west1') {
          return {
            services: [
              {
                name: 'projects/my-proj/locations/europe-west1/services/group-licensing-adder-eu',
                template: {
                  containers: [
                    {
                      env: [
                        { name: 'CONFIG_GCS_URI', value: 'gs://my-bucket/config/entitlements.json' },
                        { name: 'GOOGLE_CLOUD_PROJECT', value: 'my-proj' },
                        { name: 'LOCATION', value: 'eu' },
                        { name: 'SUBSCRIPTION_TIER', value: 'SUBSCRIPTION_TIER_ENTERPRISE' },
                        { name: 'JOB_TYPE', value: 'adder' },
                      ],
                    },
                  ],
                },
              } as any,
            ],
          };
        }
        return { services: [] };
      });
    vi.spyOn(api, 'getGcsObjectContent').mockResolvedValue(
      JSON.stringify({
        projects: {
          'my-proj': [
            {
              subscription_tier: 'SUBSCRIPTION_TIER_ENTERPRISE',
              location: 'eu',
              groups: ['eu-eng@example.com', 'eu-sales@example.com'],
            },
          ],
        },
      }),
    );
    vi.spyOn(api, 'getCloudSchedulerJob').mockResolvedValue({
      lastAttemptTime: '2026-10-28T12:00:00Z',
    });
    const deleteServiceSpy = vi
      .spyOn(api, 'deleteCloudRunService')
      .mockResolvedValue({});
    const deleteJobSpy = vi
      .spyOn(api, 'deleteCloudSchedulerJob')
      .mockResolvedValue({});

    const { result } = renderHook(() =>
      useGroupLicensing('180054373655', 'global', 'group_assignments'),
    );

    await waitFor(() => {
      expect(result.current.groupServices).toHaveLength(1);
    });

    expect(listServicesSpy).toHaveBeenCalledTimes(SUPPORTED_GROUP_RUN_REGIONS.length);
    expect(result.current.groupServices[0].name).toContain('europe-west1');
    expect(result.current.lastRunTimes['group-licensing-adder-eu']).toBe('2026-10-28T12:00:00Z');
    await waitFor(() => {
      expect(result.current.serviceGroups['group-licensing-adder-eu']).toEqual([
        'eu-eng@example.com',
        'eu-sales@example.com',
      ]);
    });

    // Verify GroupAssignmentsTab renders the Groups column and JOB_TYPE env fallback
    render(
      <GroupAssignmentsTab
        isServicesLoading={false}
        servicesError={null}
        groupServices={result.current.groupServices}
        lastRunTimes={result.current.lastRunTimes}
        serviceGroups={result.current.serviceGroups}
        apiLicenseConfigs={[]}
        onNewAssignment={vi.fn()}
        onRunService={vi.fn()}
        onEditService={vi.fn()}
        onDeleteService={vi.fn()}
      />,
    );
    expect(screen.getByText('eu-eng@example.com, eu-sales@example.com')).toBeInTheDocument();
    expect(screen.getByText('adder')).toBeInTheDocument();

    act(() => {
      result.current.setServiceToDelete(
        'projects/my-proj/locations/europe-west1/services/group-licensing-adder-eu',
      );
    });

    await act(async () => {
      await result.current.confirmDeleteService();
    });

    expect(deleteServiceSpy).toHaveBeenCalledWith(
      'projects/my-proj/locations/europe-west1/services/group-licensing-adder-eu',
      expect.objectContaining({ projectId: '180054373655' }),
    );
    expect(deleteJobSpy).toHaveBeenCalledWith(
      'my-proj',
      'europe-west1',
      'trigger-group-licensing-adder-eu',
      '180054373655',
    );
  });

  it('P0-2, P1-3, B-06, F-FE-08: GroupLicenseDeploymentModal resolves numeric projectNumber, uploads source.zip before entitlements.json, and merges existing GCS entitlements', async () => {
    vi.spyOn(api, 'getProject').mockResolvedValue({
      projectId: 'my-project-123',
      projectNumber: '180054373655',
    } as any);
    vi.spyOn(api, 'listLicenseConfigs').mockResolvedValue({
      licenseConfigs: [
        {
          name: 'projects/my-project-123/locations/global/licenseConfigs/cfg-first',
          state: 'ACTIVE',
        },
        {
          name: 'projects/my-project-123/locations/global/licenseConfigs/cfg-second',
          state: 'ACTIVE',
        },
      ],
    } as any);
    vi.spyOn(api, 'listBuckets').mockResolvedValue({
      items: [{ id: 'b1', name: 'my-staging-bucket' }],
    } as any);
    const getGcsSpy = vi.spyOn(api, 'getGcsObjectContent').mockResolvedValue(
      JSON.stringify({
        billing_account_id: '012345-6789AB-CDEF01',
        projects: {
          'my-project-123': [
            {
              subscription_tier: 'cfg-second',
              location: 'us',
              groups: ['existing-us-group@example.com'],
            },
          ],
        },
      }),
    );
    const uploadSpy = vi.spyOn(api, 'uploadFileToGcs').mockResolvedValue({} as any);
    vi.spyOn(api, 'createCloudBuild').mockResolvedValue({
      metadata: { build: { id: 'build-999' } },
    } as any);
    const onBuildTriggered = vi.fn();

    // Pass string Project ID as projectNumber prop to verify numeric details.projectNumber resolution (B-06)
    render(
      <GroupLicenseDeploymentModal
        isOpen={true}
        onClose={vi.fn()}
        projectNumber="my-project-123"
        currentConfig={{ appLocation: 'global', userStoreId: 'default_user_store' }}
        apiLicenseConfigs={[]}
        editConfig={null}
        onBuildTriggered={onBuildTriggered}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Deploy Job' })).not.toBeDisabled();
    });

    // Verify numeric projectNumber was resolved into deploy.sh preview
    await waitFor(() => {
      expect(screen.getByText(/PROJECT_NUMBER=180054373655/)).toBeInTheDocument();
    });

    // 1. Empty groupsInput must be rejected before uploading anything to GCS
    fireEvent.click(screen.getByRole('button', { name: 'Deploy Job' }));
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain(
        'At least one Google Group email is required.',
      );
    });
    expect(uploadSpy).not.toHaveBeenCalled();

    // 2. Malformed group email must be rejected
    const groupsInput = screen.getByPlaceholderText('group1@example.com, group2@example.com');
    fireEvent.change(groupsInput, { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Deploy Job' }));
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain(
        'Invalid Google Group email: "not-an-email"',
      );
    });
    expect(uploadSpy).not.toHaveBeenCalled();

    // 3. Valid group email uploads source.zip FIRST and config/entitlements.json SECOND
    fireEvent.change(groupsInput, { target: { value: 'new-global-group@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Deploy Job' }));

    await waitFor(() => {
      expect(uploadSpy).toHaveBeenCalledTimes(2);
    });
    expect(getGcsSpy).toHaveBeenCalledWith(
      'my-staging-bucket',
      'config/entitlements.json',
      'my-project-123',
    );
    expect(uploadSpy.mock.calls[0][1]).toMatch(/^source\/group-licensing-\d+\.zip$/);
    expect(uploadSpy.mock.calls[1][1]).toBe('config/entitlements.json');

    const uploadedConfigFile = uploadSpy.mock.calls[1][2] as File;
    const uploadedText = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(uploadedConfigFile);
    });
    const uploadedJson = JSON.parse(uploadedText);
    expect(uploadedJson.projects['my-project-123']).toHaveLength(2);
    expect(uploadedJson.projects['my-project-123']).toEqual(
      expect.arrayContaining([
        {
          subscription_tier: 'cfg-second',
          location: 'us',
          groups: ['existing-us-group@example.com'],
        },
        {
          subscription_tier: 'cfg-first',
          location: 'global',
          groups: ['new-global-group@example.com'],
        },
      ]),
    );
    expect(onBuildTriggered).toHaveBeenCalledWith('build-999', 'my-project-123');
  });

  it('replaces stale same-location entries across projectId and projectNumber keys and supports direct Update Groups in GCS', async () => {
    vi.spyOn(api, 'getProject').mockResolvedValue({
      projectId: 'my-project-123',
      projectNumber: '180054373655',
    } as never);
    vi.spyOn(api, 'listLicenseConfigs').mockResolvedValue({
      licenseConfigs: [
        {
          name: 'projects/my-project-123/locations/global/licenseConfigs/internal_gemini_ent_plus',
          state: 'ACTIVE',
        },
      ],
    } as never);
    vi.spyOn(api, 'listBuckets').mockResolvedValue({
      items: [{ id: 'b1', name: 'my-staging-bucket' }],
    } as never);
    const uploadSpy = vi.spyOn(api, 'uploadFileToGcs').mockResolvedValue({} as never);
    const createBuildSpy = vi.spyOn(api, 'createCloudBuild').mockResolvedValue({} as never);
    const onConfigSaved = vi.fn();
    const onClose = vi.fn();

    render(
      <GroupLicenseDeploymentModal
        isOpen={true}
        onClose={onClose}
        projectNumber="180054373655"
        currentConfig={{ appLocation: 'global', userStoreId: 'default_user_store' }}
        apiLicenseConfigs={[]}
        editConfig={{
          billing_account_id: '012345-6789AB-CDEF01',
          projects: {
            'my-project-123': [
              {
                subscription_tier: 'SUBSCRIPTION_TIER_ENTERPRISE',
                location: 'global',
                groups: ['stale-old-tier@example.com'],
              },
              {
                subscription_tier: 'internal_gemini_ent_plus',
                location: 'global',
                groups: ['old-group@example.com'],
              },
              {
                subscription_tier: 'internal_gemini_ent_plus',
                location: 'us',
                groups: ['us-group@example.com'],
              },
            ],
            '180054373655': [
              {
                subscription_tier: 'SUBSCRIPTION_TIER_ENTERPRISE',
                location: 'global',
                groups: ['stale-projnum-group@example.com'],
              },
            ],
          },
          _editMeta: {
            runRegion: 'us-central1',
            bucket: 'my-staging-bucket',
            sku: 'internal_gemini_ent_plus',
            location: 'global',
            userStoreId: 'default_user_store',
            projectId: 'my-project-123',
          },
        }}
        onConfigSaved={onConfigSaved}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Update Groups in GCS' })).not.toBeDisabled();
    });

    const groupsInput = screen.getByPlaceholderText('group1@example.com, group2@example.com') as HTMLInputElement;
    expect(groupsInput.value).toBe('old-group@example.com');

    fireEvent.change(groupsInput, { target: { value: 'updated-group@example.com' } });

    // Switch to entitlements.json preview tab and verify stale global entries are gone
    fireEvent.click(screen.getByRole('button', { name: 'entitlements.json' }));
    expect(screen.getByText(/updated-group@example\.com/)).toBeInTheDocument();
    expect(screen.queryByText(/stale-old-tier@example\.com/)).not.toBeInTheDocument();
    expect(screen.queryByText(/stale-projnum-group@example\.com/)).not.toBeInTheDocument();

    // Click Update Groups in GCS -> uploads only config/entitlements.json without Cloud Build
    fireEvent.click(screen.getByRole('button', { name: 'Update Groups in GCS' }));

    await waitFor(() => {
      expect(uploadSpy).toHaveBeenCalledTimes(1);
    });
    expect(createBuildSpy).not.toHaveBeenCalled();
    expect(uploadSpy.mock.calls[0][1]).toBe('config/entitlements.json');

    const uploadedConfigFile = uploadSpy.mock.calls[0][2] as File;
    const uploadedText = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(uploadedConfigFile);
    });
    const uploadedJson = JSON.parse(uploadedText);
    expect(uploadedJson.projects['my-project-123']).toEqual([
      {
        subscription_tier: 'internal_gemini_ent_plus',
        location: 'us',
        groups: ['us-group@example.com'],
      },
      {
        subscription_tier: 'internal_gemini_ent_plus',
        location: 'global',
        groups: ['updated-group@example.com'],
      },
    ]);
    expect(uploadedJson.projects['180054373655']).toEqual(uploadedJson.projects['my-project-123']);
    expect(onConfigSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('parses structured GROUP_LICENSING_REPORT_JSON log lines and isolates the latest run from older runs', () => {
    const structuredReport = {
      status: 'success',
      httpStatus: 200,
      jobType: 'adder',
      projectId: 'my-proj',
      location: 'global',
      subscriptionTier: 'gemini-ent-std',
      durationSeconds: 3.42,
      message: 'Job adder completed.',
      summary: {
        job: 'adder',
        dryRun: false,
        groups: 2,
        groupMemberCounts: { 'eng@example.com': 120, 'pm@example.com': 30 },
        entitledUsers: 145,
        alreadyCorrect: 140,
        skippedUnmanaged: 2,
        skippedUnmanagedSample: ['exec1@example.com', 'exec2@example.com'],
        plannedAssignments: 3,
        assignedUsersSample: ['new1@example.com', 'new2@example.com', 'new3@example.com'],
        write: { chunks: 1, submitted: 3, succeeded: 3, failed: 0, unverifiedChunks: 0 },
        verification: { missingAssignments: 0, sample: [] },
        warnings: [],
      },
    };

    // Entries ordered newest-first as returned by Cloud Logging
    const entries = [
      {
        timestamp: '2026-04-01T12:00:04Z',
        httpRequest: { status: 200, latency: '3.420s' },
      },
      {
        timestamp: '2026-04-01T12:00:03Z',
        textPayload: `GROUP_LICENSING_REPORT_JSON: ${JSON.stringify(structuredReport)}`,
      },
      {
        timestamp: '2026-04-01T12:00:02Z',
        textPayload: 'Applying 3 license assignments (140 already up to date)...',
      },
      {
        timestamp: '2026-04-01T12:00:00Z',
        textPayload: 'Running Joiner workflow...',
      },
      // Older run that should be excluded from rawLogs
      {
        timestamp: '2026-04-01T06:00:01Z',
        textPayload: 'FATAL ERROR: Old failure from 6 hours ago',
      },
    ];

    const { report, isComplete } = api.parseGroupLicensingRunLogs(entries, {
      serviceId: 'group-licensing-adder-global',
      serviceName: 'projects/my-proj/locations/us-central1/services/group-licensing-adder-global',
    });

    expect(isComplete).toBe(true);
    expect(report).not.toBeNull();
    expect(report?.source).toBe('structured_json');
    expect(report?.status).toBe('success');
    expect(report?.httpStatus).toBe(200);
    expect(report?.durationSeconds).toBe(3.42);
    expect(report?.summary.groups).toBe(2);
    expect(report?.summary.entitledUsers).toBe(145);
    expect(report?.summary.plannedAssignments).toBe(3);
    expect(report?.summary.alreadyCorrect).toBe(140);
    expect(report?.summary.assignedUsersSample).toEqual([
      'new1@example.com',
      'new2@example.com',
      'new3@example.com',
    ]);
    expect(report?.rawLogs).toEqual([
      'Running Joiner workflow...',
      'Applying 3 license assignments (140 already up to date)...',
    ]);
  });

  it('parses legacy stdout logs and malformed report JSON via Regex Pattern Matching fallback', () => {
    const entries = [
      {
        timestamp: '2026-04-01T13:00:05Z',
        httpRequest: { status: 200, latency: '1.85s' },
      },
      {
        timestamp: '2026-04-01T13:00:04Z',
        textPayload: 'GROUP_LICENSING_REPORT_JSON: {malformed-json',
      },
      {
        timestamp: '2026-04-01T13:00:03Z',
        textPayload: 'Applying 2 license revocations...',
      },
      {
        timestamp: '2026-04-01T13:00:02Z',
        textPayload:
          'User bob@example.com is no longer entitled. Revoking license.\nUser carol@example.com is no longer entitled. Revoking license.',
      },
      {
        timestamp: '2026-04-01T13:00:01Z',
        textPayload: 'Resolved 18 user members (from 20 total entries) in 1 page(s).',
      },
      {
        timestamp: '2026-04-01T13:00:00Z',
        textPayload: 'Resolving entitled members for group: Contractors@Example.com',
      },
      {
        timestamp: '2026-04-01T12:59:59Z',
        textPayload: 'Running Garbage Collection workflow...',
      },
    ];

    const { report, isComplete } = api.parseGroupLicensingRunLogs(entries, {
      serviceId: 'group-licensing-cleanup-global',
      serviceName: 'projects/my-proj/locations/us-central1/services/group-licensing-cleanup-global',
    });

    expect(isComplete).toBe(true);
    expect(report?.source).toBe('parsed_stdout');
    expect(report?.status).toBe('success');
    expect(report?.jobType).toBe('cleanup');
    expect(report?.durationSeconds).toBe(1.85);
    expect(report?.summary.groupMemberCounts).toEqual({ 'contractors@example.com': 18 });
    expect(report?.summary.plannedRevocations).toBe(2);
    expect(report?.summary.revokedUsersSample).toEqual(['bob@example.com', 'carol@example.com']);
    expect(report?.rawLogs.some((l) => l.startsWith('[Malformed report JSON:'))).toBe(true);
  });

  it('populates activeReport after manual run and renders the post-run report in GroupAssignmentsTab', async () => {
    vi.spyOn(api, 'ensureCloudRunInvokerRole').mockResolvedValue(undefined);
    vi.spyOn(api, 'triggerCloudRunServiceJob').mockResolvedValue({
      name: 'projects/my-proj/locations/us-central1/jobs/trigger-group-licensing-cleanup-global',
    });
    const mockReport = {
      serviceId: 'group-licensing-cleanup-global',
      serviceName: 'projects/my-proj/locations/us-central1/services/group-licensing-cleanup-global',
      jobType: 'cleanup',
      status: 'aborted' as const,
      httpStatus: 412,
      timestamp: '2026-04-01T14:00:00Z',
      durationSeconds: 0.74,
      location: 'global',
      subscriptionTier: 'gemini-ent-plus',
      message: 'Cleanup aborted before any changes: Configured group(s) returned 0 members: empty@example.com.',
      summary: {
        job: 'cleanup',
        groups: 1,
        groupMemberCounts: { 'empty@example.com': 0 },
        entitledUsers: 0,
        managedLicenses: 250,
        plannedRevocations: 0,
        revocationLimit: 50,
        warnings: ['Group empty@example.com returned 0 members'],
      },
      rawLogs: [
        'Running Garbage Collection workflow...',
        'SAFETY GUARD - no changes were made: Configured group(s) returned 0 members: empty@example.com.',
      ],
      source: 'structured_json' as const,
    };
    const fetchReportSpy = vi
      .spyOn(api, 'fetchGroupLicensingRunReport')
      .mockResolvedValue(mockReport);

    const { result } = renderHook(() =>
      useGroupLicensing('180054373655', 'global', 'user_licenses'),
    );

    const cleanupService: CloudRunServiceItem = {
      name: 'projects/my-proj/locations/us-central1/services/group-licensing-cleanup-global',
      uri: 'https://group-licensing-cleanup-global-abc123-uc.a.run.app',
      labels: {
        'ge-region': 'global',
        'ge-sku': 'gemini-ent-plus',
        'job-type': 'cleanup',
      },
    };

    await act(async () => {
      await result.current.handleRunService(cleanupService);
    });

    expect(fetchReportSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'my-proj',
        serviceId: 'group-licensing-cleanup-global',
        waitForCompletion: true,
      }),
    );
    expect(result.current.activeReport).toEqual(mockReport);
    expect(toastMock.warning).toHaveBeenCalledWith(
      expect.stringContaining('was aborted by safety guard'),
    );

    const onCloseReport = vi.fn();
    render(
      <GroupAssignmentsTab
        isServicesLoading={false}
        servicesError={null}
        groupServices={[cleanupService]}
        lastRunTimes={{}}
        activeReport={result.current.activeReport}
        onCloseReport={onCloseReport}
        apiLicenseConfigs={[]}
        onNewAssignment={vi.fn()}
        onRunService={vi.fn()}
        onEditService={vi.fn()}
        onDeleteService={vi.fn()}
      />,
    );

    const reportPanel = screen.getByTestId('group-licensing-run-report');
    expect(reportPanel.textContent).toContain('SAFETY ABORTED (HTTP 412)');
    expect(reportPanel.textContent).toContain('Configured group(s) returned 0 members: empty@example.com.');
    expect(reportPanel.textContent).toContain('250');

    fireEvent.click(screen.getByRole('button', { name: /Show Execution Logs/i }));
    expect(reportPanel.textContent).toContain('Running Garbage Collection workflow...');

    fireEvent.click(screen.getByRole('button', { name: 'Close Report' }));
    expect(onCloseReport).toHaveBeenCalledTimes(1);
  });

  it('treats Cloud Scheduler gRPC code -1 as in-flight running (not error) and continues polling until Cloud Run logs arrive', async () => {
    // 1. Direct unit check on parseGroupLicensingRunLogs: code -1 is in-flight ("running"), NOT an error
    const inFlightResult = api.parseGroupLicensingRunLogs([], {
      serviceId: 'group-licensing-adder-global',
      serviceName: 'projects/my-proj/locations/us-central1/services/group-licensing-adder-global',
      schedulerStatus: {
        lastAttemptTime: '2026-11-05T18:05:11Z',
        status: { code: -1 },
      },
    });
    expect(inFlightResult.isComplete).toBe(false);
    expect(inFlightResult.report?.status).toBe('running');
    expect(inFlightResult.report?.message).toContain('currently executing');

    // Positive gRPC codes (e.g. 7 = PERMISSION_DENIED) must still be reported as completed errors
    const permissionDeniedResult = api.parseGroupLicensingRunLogs([], {
      serviceId: 'group-licensing-adder-global',
      serviceName: 'projects/my-proj/locations/us-central1/services/group-licensing-adder-global',
      schedulerStatus: {
        lastAttemptTime: '2026-11-05T18:05:11Z',
        status: { code: 7, message: 'Caller lacks run.routes.invoke' },
      },
    });
    expect(permissionDeniedResult.isComplete).toBe(true);
    expect(permissionDeniedResult.report?.status).toBe('error');
    expect(permissionDeniedResult.report?.message).toContain('PERMISSION_DENIED');
    expect(permissionDeniedResult.report?.message).toContain('Caller lacks run.routes.invoke');

    // 2. Behavioral check on fetchGroupLicensingRunReport: attempt 1 has empty logs while Cloud Run is in flight,
    //    attempt 2 returns the completed structured report.
    const structuredReport = {
      status: 'success',
      httpStatus: 200,
      jobType: 'adder',
      projectId: 'my-proj',
      location: 'global',
      subscriptionTier: 'internal_gemini_ent_plus',
      durationSeconds: 1.92,
      message: 'Job adder completed.',
      summary: {
        job: 'adder',
        dryRun: false,
        groups: 1,
        groupMemberCounts: { 'test2@wdufrin.altostrat.com': 4 },
        entitledUsers: 4,
        alreadyCorrect: 3,
        plannedAssignments: 1,
        assignedUsersSample: ['alice@wdufrin.altostrat.com'],
        warnings: [],
      },
    };
    const gapiSpy = vi
      .spyOn(core, 'gapiRequest')
      .mockResolvedValueOnce({ entries: [] } as never)
      .mockResolvedValueOnce({
        entries: [
          {
            timestamp: '2026-11-05T18:05:14Z',
            httpRequest: { status: 200, latency: '1.920s' },
          },
          {
            timestamp: '2026-11-05T18:05:13Z',
            textPayload: `GROUP_LICENSING_REPORT_JSON: ${JSON.stringify(structuredReport)}`,
          },
        ],
      } as never);

    const report = await api.fetchGroupLicensingRunReport({
      projectId: 'my-proj',
      quotaProjectId: '180054373655',
      region: 'us-central1',
      serviceName: 'projects/my-proj/locations/us-central1/services/group-licensing-adder-global',
      serviceId: 'group-licensing-adder-global',
      jobId: 'trigger-group-licensing-adder-global',
      sinceTimestamp: '2026-11-05T18:05:10Z',
      waitForCompletion: true,
      maxAttempts: 3,
      pollIntervalMs: 1,
    });

    // Only 2 Cloud Logging calls should be made (no premature Cloud Scheduler status call on attempt 1)
    expect(gapiSpy).toHaveBeenCalledTimes(2);
    expect(report?.status).toBe('success');
    expect(report?.summary.groupMemberCounts).toEqual({ 'test2@wdufrin.altostrat.com': 4 });
    expect(report?.summary.plannedAssignments).toBe(1);

    // 3. Direct check on partial cold-start logs: extracts group inline from "Resolved N user members for <group>"
    //    and suppresses benign "Warning: userLicenses filter was rejected (400: {" from warnings
    const partialColdStart = api.parseGroupLicensingRunLogs(
      [
        {
          timestamp: '2026-11-05T18:54:41Z',
          textPayload:
            'Warning: userLicenses filter was rejected (400: {\n"error": {\n"code": 400,\n"message": "Invalid filter field: licenseAssignmentState.",\n"status": "INVALID_ARGUMENT"\n}',
        },
        {
          timestamp: '2026-11-05T18:54:40Z',
          textPayload: 'Resolved 2 user members for test2@wdufrin.altostrat.com (from 3 total directory entries)',
        },
        {
          timestamp: '2026-11-05T18:54:38Z',
          textPayload: 'Container starting...',
        },
      ],
      {
        serviceId: 'group-licensing-adder-global',
        serviceName: 'projects/my-proj/locations/us-central1/services/group-licensing-adder-global',
      },
    );
    expect(partialColdStart.isComplete).toBe(false);
    expect(partialColdStart.report?.status).toBe('running');
    expect(partialColdStart.report?.summary.groups).toBe(1);
    expect(partialColdStart.report?.summary.entitledUsers).toBe(2);
    expect(partialColdStart.report?.summary.groupMemberCounts).toEqual({
      'test2@wdufrin.altostrat.com': 2,
    });
    expect(partialColdStart.report?.summary.warnings).toEqual([]);
  });
});



