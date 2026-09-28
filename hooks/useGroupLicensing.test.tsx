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
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { useGroupLicensing } from './useGroupLicensing';
import { GroupAssignmentsTab } from '../components/license/GroupAssignmentsTab';
import { CloudRunServiceItem } from '../components/license/types';
import * as api from '../services/apiService';
import * as core from '../services/api/core';
import { GapiError } from '../services/api/core';
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

  it('rejects empty/missing service input with a warning toast and makes no API calls', async () => {
    const triggerJobSpy = vi.spyOn(api, 'triggerCloudRunServiceJob');
    const gapiSpy = vi.spyOn(core, 'gapiRequest');

    const { result } = renderHook(() =>
      useGroupLicensing('180054373655', 'global', 'user_licenses'),
    );

    await act(async () => {
      await result.current.handleRunService(undefined);
      await result.current.handleRunService({ name: '' });
    });

    expect(toastMock.warning).toHaveBeenCalledTimes(2);
    expect(toastMock.warning).toHaveBeenCalledWith('Service URL is not available.');
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
});
