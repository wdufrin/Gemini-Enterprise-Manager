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
    expect(script).toContain('--timeout=540');
    expect(script).toContain('--attempt-deadline=540s');
    expect(script).toContain(
      'gcloud storage buckets add-iam-policy-binding gs://my-staging-bucket --member="serviceAccount:$SA_EMAIL" --role="roles/storage.objectViewer"',
    );
    expect(script).not.toContain('--role="roles/storage.objectViewer" --condition=None');
  });

  it('P0-1, P0-2, P1-2, B-05: executes main.py.template functions (get_highest_tier, list_group_members, run_adder diffing, run_cleanup, retry/backoff, LRO error detection, and concurrency lock)', async () => {
    const { execFileSync } = await import('node:child_process');
    const pyHarness = `
import sys, types, json

# Stub flask and google.auth so main.py.template loads without external packages
flask_mod = types.ModuleType("flask")
class DummyFlask:
    def __init__(self, name): pass
    def route(self, *a, **kw):
        def dec(f): return f
        return dec
flask_mod.Flask = DummyFlask
flask_mod.request = None
flask_mod.jsonify = lambda x: x
sys.modules["flask"] = flask_mod

google_mod = types.ModuleType("google")
auth_mod = types.ModuleType("google.auth")
auth_mod.default = lambda scopes=None: (None, "proj")
transport_mod = types.ModuleType("google.auth.transport")
requests_mod = types.ModuleType("google.auth.transport.requests")
requests_mod.AuthorizedSession = object
sys.modules["google"] = google_mod
sys.modules["google.auth"] = auth_mod
sys.modules["google.auth.transport"] = transport_mod
sys.modules["google.auth.transport.requests"] = requests_mod

with open("components/license/main.py.template", "r") as f:
    code = f.read()

ns = {"__name__": "test_main"}
exec(compile(code, "main.py.template", "exec"), ns)
ns["PROJECT_ID"] = "my-proj"
ns["PROJECT_NUMBER"] = "180054373655"
ns["LOCATION"] = "global"
ns["RETRY_BASE_DELAY_SECONDS"] = 0.0

# 1. P0-1: get_highest_tier supports both PRECEDENCE tiers and custom LicenseConfig resource IDs
assert ns["get_highest_tier"]({"SUBSCRIPTION_TIER_SEARCH", "SUBSCRIPTION_TIER_ENTERPRISE"}) == "SUBSCRIPTION_TIER_ENTERPRISE"
assert ns["get_highest_tier"]({"custom-license-cfg-id-123"}) == "custom-license-cfg-id-123"
assert ns["get_highest_tier"](set()) is None

# 2. P1-2: list_group_members passes includeDerivedMembership=true, filters USER, excludes .gserviceaccount.com, and lowercases
class MockResp:
    def __init__(self, status_code, data):
        self.status_code = status_code
        self._data = data
        self.text = json.dumps(data)
    def json(self):
        return self._data

class MockSession:
    def __init__(self):
        self.get_urls = []
        self.post_calls = []
        self.transient_429_remaining = 1
    def get(self, url, timeout=None):
        self.get_urls.append(url)
        if self.transient_429_remaining > 0 and "/members" in url:
            self.transient_429_remaining -= 1
            return MockResp(429, {"error": "rate limited"})
        if "/members" in url:
            return MockResp(200, {
                "members": [
                    {"email": "Alice@Example.com ", "type": "USER"},
                    {"email": "NewJoiner@Example.com", "type": "USER"},
                    {"email": "nested-group@example.com", "type": "GROUP"},
                    {"email": "license-grouper-sa@my-proj.iam.gserviceaccount.com", "type": "USER"},
                ]
            })
        if "/userLicenses" in url:
            return MockResp(200, {
                "userLicenses": [
                    {"userPrincipal": "alice@example.com", "licenseAssignmentState": "ASSIGNED", "licenseConfig": "projects/180054373655/locations/global/licenseConfigs/custom-cfg-1"},
                    {"userPrincipal": "departed@example.com", "licenseAssignmentState": "ASSIGNED", "licenseConfig": "projects/180054373655/locations/global/licenseConfigs/custom-cfg-1"},
                    {"userPrincipal": "vip-manual@example.com", "licenseAssignmentState": "ASSIGNED", "licenseConfig": "projects/180054373655/locations/global/licenseConfigs/other-unmanaged-tier"},
                    {"userPrincipal": "unassigned@example.com", "licenseAssignmentState": "NO_LICENSE"},
                ]
            })
        return MockResp(404, {})
    def post(self, url, json=None, timeout=None):
        self.post_calls.append((url, json))
        return MockResp(200, {})

sess = MockSession()
members = ns["list_group_members"](sess, "eng team@example.com")
assert members == ["alice@example.com", "newjoiner@example.com"], f"Unexpected members: {members}"
assert len(sess.get_urls) == 2, "Expected 1 transient 429 retry + 1 success"
assert "includeDerivedMembership=true" in sess.get_urls[0]
assert "eng%20team%40example.com" in sess.get_urls[0]

# 3. P0-1 & Diffing: run_adder skips alice@example.com (already ASSIGNED custom-cfg-1) and only updates newjoiner@example.com
config = {
    "projects": {
        "my-proj": [
            {"subscription_tier": "custom-cfg-1", "location": "global", "groups": ["eng@example.com"]},
            {"subscription_tier": "eu-only-cfg", "location": "eu", "groups": ["eu@example.com"]}
        ]
    }
}
ns["run_adder"](sess, "https://discoveryengine.googleapis.com/v1", "projects/my-proj/locations/global/userStores/default_user_store", config)
assert len(sess.post_calls) == 1
adder_payload = sess.post_calls[0][1]
assert adder_payload["inlineSource"]["userLicenses"] == [{
    "userPrincipal": "newjoiner@example.com",
    "licenseConfig": "projects/180054373655/locations/global/licenseConfigs/custom-cfg-1"
}]

# 4. P0-2: run_cleanup revokes only departed users on managed_tiers, sparing vip-manual and NO_LICENSE
sess.post_calls.clear()
ns["run_cleanup"](sess, "https://discoveryengine.googleapis.com/v1", "projects/my-proj/locations/global/userStores/default_user_store", config)
assert len(sess.post_calls) == 1
cleanup_payload = sess.post_calls[0][1]
assert cleanup_payload["inlineSource"]["userLicenses"] == [{"userPrincipal": "departed@example.com"}]

# 5. P0-2 Negative test: run_cleanup fails closed when entitled_groups is empty
empty_config = {"projects": {"my-proj": [{"subscription_tier": "custom-cfg-1", "location": "global", "groups": []}]}}
try:
    ns["run_cleanup"](sess, "https://discoveryengine.googleapis.com/v1", "projects/my-proj/locations/global/userStores/default_user_store", empty_config)
    raise AssertionError("Expected RuntimeError when entitled_groups is empty")
except RuntimeError as e:
    assert "Refusing to revoke all licenses" in str(e)

# 6. LRO embedded error detection & multi-chunk continuation in batch_update_licenses
class ChunkTestSession:
    def __init__(self):
        self.calls = 0
    def post(self, url, json=None, timeout=None):
        self.calls += 1
        if self.calls == 1:
            # Chunk 1 returns HTTP 200 but contains an embedded LRO error
            return MockResp(200, {"error": {"code": 7, "message": "Quota exceeded for chunk 1"}})
        return MockResp(200, {"name": "operations/op-chunk-2"})

chunk_sess = ChunkTestSession()
many_updates = [{"userPrincipal": f"user{i}@example.com"} for i in range(150)]
try:
    ns["batch_update_licenses"](chunk_sess, "https://discoveryengine.googleapis.com/v1", "parent", many_updates)
    raise AssertionError("Expected RuntimeError when chunk 1 returned LRO error")
except RuntimeError as e:
    assert "chunk 1 returned LRO error" in str(e)
    assert chunk_sess.calls == 2, f"Expected both chunks to be attempted before raising, got {chunk_sess.calls}"

# 7. In-process concurrency lock returns HTTP 409 when a job is already running
ns["_JOB_LOCK"].acquire()
try:
    resp_body, status_code = ns["handle_trigger"]()
    assert status_code == 409
    assert "already running" in resp_body["message"]
finally:
    ns["_JOB_LOCK"].release()

print("PYTHON_HARNESS_OK")
`;
    const out = execFileSync('python3', ['-c', pyHarness], {
      cwd: process.cwd(),
      encoding: 'utf-8',
    });
    expect(out).toContain('PYTHON_HARNESS_OK');
  });

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
});

