/**
 * Copyright 2026 Google LLC
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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BulkAssignCsvModal,
  parseAndValidateEmailList,
  evaluateSeatCapacity,
} from './BulkAssignCsvModal';
import * as licensesApi from '../../services/api/licenses';
import * as apiService from '../../services/apiService';
import LicensePage from '../../pages/LicensePage';
import { ToastProvider } from '../../context/ToastContext';
import { WorkspaceScopeProvider } from '../../context/WorkspaceScopeContext';
import {
  getCachedUserLicenses,
  setCachedUserLicenses,
  clearCachedUserLicenses,
} from '../../services/licenseCache';
import { generateMainPy } from './pruner/prunerTemplates';

vi.mock('../../services/api/licenses', () => ({
  assignUserLicenses: vi.fn(),
}));

vi.mock('../../services/apiService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/apiService')>();
  return {
    ...actual,
    listUserStoreLicenses: vi.fn(),
    listLicenseConfigs: vi.fn(),
    assignUserLicenses: vi.fn(),
    getLicenseConfig: vi.fn(),
    listCloudRunServices: vi.fn().mockResolvedValue({ services: [] }),
    getProject: vi.fn().mockResolvedValue({ projectId: 'ent-proj-999', projectNumber: '999' }),
    getCloudSchedulerJob: vi.fn().mockRejectedValue(new Error('404')),
  };
});

const mockedAssign = vi.mocked(licensesApi.assignUserLicenses);
const mockedApiService = vi.mocked(apiService);

describe('BulkAssignCsvModal & Regional License Cache / Pruner Fixes (Item #10a)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await clearCachedUserLicenses('proj-1', 'default_user_store', 'global');
    await clearCachedUserLicenses('proj-1', 'default_user_store', 'eu');
    await clearCachedUserLicenses('proj-1', 'default_user_store', 'us');
  });

  it('validates RFC-like emails, strips CSV headers, deduplicates case-insensitively, and flags malformed/hostile email strings', () => {
    const csvSample = [
      'Name,Email,Department',
      'Alice New,Alice.New@Example.com,Engineering',
      'Alice Duplicate,alice.new@example.com,Engineering',
      'Bob Valid,bob_smith+onboarding@sub.corp.io,Finance',
      'Bad Dot,.leadingdot@example.com,Ops',
      'Double Dot,alice..bob@example.com,Ops',
      'No Domain,missing-at-symbol,Sales',
      'Hostile Script,<script>@evil,Sec',
    ].join('\n');

    const parsed = parseAndValidateEmailList(csvSample);
    expect(parsed.validEmails).toEqual([
      'alice.new@example.com',
      'bob_smith+onboarding@sub.corp.io',
    ]);
    expect(parsed.duplicateCount).toBe(1);
    expect(parsed.invalidEntries).toEqual([
      '.leadingdot@example.com',
      'alice..bob@example.com',
      'missing-at-symbol',
      '<script>@evil',
    ]);
  });

  it('blocks submission on malformed emails, insufficient seat capacity, or missing ASSIGN confirmation', () => {
    const limitedConfig = {
      name: 'projects/123/locations/global/licenseConfigs/std-pool',
      displayName: 'Standard Pool',
      licenseCount: 3,
      subscriptionTier: 'GEMINI_ENTERPRISE',
    };
    const existing = [
      {
        userPrincipal: 'existing1@company.com',
        licenseAssignmentState: 'ASSIGNED',
        licenseConfig: limitedConfig.name,
      },
      {
        userPrincipal: 'existing2@company.com',
        licenseAssignmentState: 'ASSIGNED',
        licenseConfig: limitedConfig.name,
      },
    ];

    // Only 1 seat remains (3 total - 2 used); requesting 2 net-new seats must trigger shortfall
    const capacityCheck = evaluateSeatCapacity(
      ['new1@company.com', 'new2@company.com'],
      limitedConfig,
      existing,
    );
    expect(capacityCheck.availableSeats).toBe(1);
    expect(capacityCheck.exceedsCapacity).toBe(true);
    expect(capacityCheck.seatShortfall).toBe(1);

    render(
      <BulkAssignCsvModal
        isOpen={true}
        onClose={() => {}}
        projectNumber="123"
        appLocation="global"
        apiLicenseConfigs={[limitedConfig]}
        existingLicenses={existing}
      />,
    );

    const textarea = screen.getByTestId('csv-emails-textarea');
    const confirmInput = screen.getByTestId('csv-confirm-input');
    const submitBtn = screen.getByTestId('csv-assign-submit-button');

    // 1. Malformed email blocks submit even when ASSIGN is typed
    fireEvent.change(textarea, { target: { value: 'not-an-email' } });
    fireEvent.change(confirmInput, { target: { value: 'ASSIGN' } });
    expect(screen.getByTestId('csv-invalid-warning')).toHaveTextContent('not-an-email');
    expect(submitBtn).toBeDisabled();

    // 2. Valid emails exceeding remaining seat pool block submit with shortfall alert
    fireEvent.change(textarea, {
      target: { value: 'new1@company.com\nnew2@company.com' },
    });
    expect(screen.getByTestId('csv-seat-shortfall-error')).toHaveTextContent(
      /Seat Capacity Exceeded/i,
    );
    expect(submitBtn).toBeDisabled();

    // 3. Within capacity (1 net-new email), wrong confirmation word still blocks submit
    fireEvent.change(textarea, { target: { value: 'new1@company.com' } });
    fireEvent.change(confirmInput, { target: { value: 'yes' } });
    expect(submitBtn).toBeDisabled();

    // 4. Typing exact ASSIGN enables submit
    fireEvent.change(confirmInput, { target: { value: 'ASSIGN' } });
    expect(submitBtn).not.toBeDisabled();
  });

  it('chunks >100 net-new employee emails into batches of 100 via assignUserLicenses', async () => {
    mockedAssign.mockResolvedValue({ name: 'operations/batch-1', done: true });
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    const poolConfig = {
      name: 'projects/123/locations/eu/licenseConfigs/eu-plus-pool',
      displayName: 'EU Plus Pool',
      licenseCount: 500,
      subscriptionTier: 'GEMINI_ENTERPRISE_PLUS',
    };

    const emails135 = Array.from(
      { length: 135 },
      (_, idx) => `newhire.${idx + 1}@enterprise.eu`,
    ).join('\n');

    render(
      <BulkAssignCsvModal
        isOpen={true}
        onClose={onClose}
        projectNumber="123"
        appLocation="eu"
        apiLicenseConfigs={[poolConfig]}
        existingLicenses={[]}
        onAssignSuccess={onSuccess}
      />,
    );

    fireEvent.change(screen.getByTestId('csv-emails-textarea'), {
      target: { value: emails135 },
    });
    fireEvent.change(screen.getByTestId('csv-confirm-input'), {
      target: { value: 'ASSIGN' },
    });
    fireEvent.click(screen.getByTestId('csv-assign-submit-button'));

    await waitFor(() => expect(mockedAssign).toHaveBeenCalledTimes(2));
    expect(mockedAssign.mock.calls[0][0].appLocation).toBe('eu');
    expect(mockedAssign.mock.calls[0][2]).toHaveLength(100);
    expect(mockedAssign.mock.calls[1][2]).toHaveLength(35);
    expect(mockedAssign.mock.calls[0][3]).toBe(poolConfig.name);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('isolates licenseCache keys by appLocation (global vs eu vs us) and generates regional chunked pruner Python code', async () => {
    await setCachedUserLicenses(
      'proj-1',
      'default_user_store',
      [{ userPrincipal: 'global-user@corp.com', licenseAssignmentState: 'ASSIGNED' }],
      'global',
    );
    await setCachedUserLicenses(
      'proj-1',
      'default_user_store',
      [{ userPrincipal: 'eu-user@corp.eu', licenseAssignmentState: 'ASSIGNED' }],
      'eu',
    );

    const globalCached = await getCachedUserLicenses('proj-1', 'default_user_store', 60000, 'global');
    const euCached = await getCachedUserLicenses('proj-1', 'default_user_store', 60000, 'eu');
    const usCached = await getCachedUserLicenses('proj-1', 'default_user_store', 60000, 'us');

    expect(globalCached?.data[0].userPrincipal).toBe('global-user@corp.com');
    expect(euCached?.data[0].userPrincipal).toBe('eu-user@corp.eu');
    expect(usCached).toBeNull();

    const euPython = generateMainPy(30, 'eu', 'default_user_store');
    expect(euPython).toContain('f"https://{normalized_loc}-discoveryengine.googleapis.com/v1"');
    expect(euPython).toContain('CHUNK_SIZE = 100');
    expect(euPython).toContain('for idx in range(0, len(inactive_principals), CHUNK_SIZE):');
  });

  it('closes on Escape via canonical Modal portal (z-[70]), blocks Escape while submitting, and passes custom userStoreId', async () => {
    let resolveBatch: () => void = () => undefined;
    mockedAssign.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBatch = () => resolve({ name: 'operations/batch-custom', done: true });
        }),
    );

    const onClose = vi.fn();
    const poolConfig = {
      name: 'projects/123/locations/us/licenseConfigs/us-std-pool',
      displayName: 'US Standard Pool',
      licenseCount: 50,
      subscriptionTier: 'GEMINI_ENTERPRISE',
    };

    render(
      <BulkAssignCsvModal
        isOpen={true}
        onClose={onClose}
        projectNumber="123"
        appLocation="us"
        userStoreId="custom_emea_user_store"
        apiLicenseConfigs={[poolConfig]}
        existingLicenses={[]}
      />,
    );

    const dialog = screen.getByRole('dialog', {
      name: /Bulk Assign User Licenses/i,
    });
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.className).toContain('z-[70]');

    // Pressing Escape when idle invokes onClose
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Start an in-flight batch assignment and verify Escape is blocked while submitting
    onClose.mockClear();
    fireEvent.change(screen.getByTestId('csv-emails-textarea'), {
      target: { value: 'contractor.one@corp.us' },
    });
    fireEvent.change(screen.getByTestId('csv-confirm-input'), {
      target: { value: 'ASSIGN' },
    });
    fireEvent.click(screen.getByTestId('csv-assign-submit-button'));

    await waitFor(() => expect(mockedAssign).toHaveBeenCalledTimes(1));
    expect(mockedAssign.mock.calls[0][1]).toBe('custom_emea_user_store');

    // Negative check: Escape must NOT close modal while batch request is in flight
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    resolveBatch();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('wires custom User Store ID from LicensePage ScopeBar into CSV bulk assignment and switches to Automated License Pruner tab', async () => {
    sessionStorage.clear();
    const poolConfig = {
      name: 'projects/999/locations/eu/licenseConfigs/eu-ent-pool',
      displayName: 'EU Enterprise Pool',
      licenseCount: 100,
      state: 'ACTIVE',
      subscriptionTier: 'GEMINI_ENTERPRISE',
    };
    mockedApiService.listUserStoreLicenses.mockResolvedValue({ userLicenses: [] });
    mockedApiService.listLicenseConfigs.mockResolvedValue({ licenseConfigs: [poolConfig] });
    mockedApiService.assignUserLicenses.mockResolvedValue({ name: 'operations/ok', done: true });

    render(
      <ToastProvider>
        <WorkspaceScopeProvider projectKey="999">
          <LicensePage projectNumber="999" projectId="ent-proj-999" setProjectNumber={vi.fn()} />
        </WorkspaceScopeProvider>
      </ToastProvider>,
    );

    await waitFor(() => expect(mockedApiService.listLicenseConfigs).toHaveBeenCalled());

    // Change Location and custom User Store ID in LicensePage ScopeBar
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'eu' } });
    fireEvent.change(screen.getByLabelText('User Store ID'), {
      target: { value: 'custom_eu_store' },
    });

    // Open CSV Bulk Assign modal from UserLicensesTab and submit
    fireEvent.click(screen.getByTestId('open-bulk-assign-csv-button'));
    fireEvent.change(await screen.findByTestId('csv-emails-textarea'), {
      target: { value: 'alice.eu@corp.eu' },
    });
    fireEvent.change(screen.getByTestId('csv-confirm-input'), {
      target: { value: 'ASSIGN' },
    });
    fireEvent.click(screen.getByTestId('csv-assign-submit-button'));

    await waitFor(() => expect(mockedApiService.assignUserLicenses).toHaveBeenCalledTimes(1));
    expect(mockedApiService.assignUserLicenses).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: '999', appLocation: 'eu' }),
      'custom_eu_store',
      ['alice.eu@corp.eu'],
      poolConfig.name,
    );

    // Clicking Setup Auto-Pruner switches directly to Tab 5 instead of opening a duplicate modal
    fireEvent.click(screen.getByRole('button', { name: /Setup Auto-Pruner/i }));
    expect(
      screen.getByRole('tab', { name: /Automated License Pruner/i }),
    ).toHaveAttribute('aria-selected', 'true');
  });
});
