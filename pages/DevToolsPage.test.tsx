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
import DevToolsPage, {
  parseAndValidateActuationUrls,
  validateMcpAllowlistJson,
} from './DevToolsPage';
import UserStoreConfigTab, {
  validateLicenseAssignmentTierRules,
} from '../components/license/UserStoreConfigTab';
import { AllocationsTab } from '../components/license/AllocationsTab';
import { ProjectEnrollmentProvider } from '../context/ProjectEnrollmentContext';
import * as api from '../services/apiService';
import { ProjectEnrollmentStatus } from '../types';

vi.mock('../services/apiService', () => ({
  getDevToolsConfig: vi.fn(),
  updateDevToolsConfig: vi.fn(),
  getUserStore: vi.fn(),
  updateUserStore: vi.fn(),
  getProjectOverageConfig: vi.fn(),
  updateProjectOverageConfig: vi.fn(),
}));

const mockedApi = vi.mocked(api);

const enrolledStatus: ProjectEnrollmentStatus = {
  projectId: 'ent-prod-999',
  checkedAt: '2026-11-19T16:00:00Z',
  googleInternal: true,
  trustedTester: true,
  notebookLmApiUser: true,
  agentRegistryEnabled: true,
  categories: [],
};

function renderWithEnrollment(ui: React.ReactElement) {
  return render(
    <ProjectEnrollmentProvider
      projectId="ent-prod-999"
      projectNumber="999888777"
      isGapiReady={false}
      initialEnrollment={enrolledStatus}
    >
      {ui}
    </ProjectEnrollmentProvider>,
  );
}

describe('DevToolsPage & Licensing Workstream 4 UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.getDevToolsConfig.mockResolvedValue({
      name: 'projects/ent-prod-999/locations/global/devToolsConfig',
      devToolsEnabled: true,
      agentConfig: {
        sandboxModeEnabled: true,
        outsideWorkspaceFileAccessPolicy: 'FILE_ACCESS_POLICY_DENY',
        terminalCommandAutoExecutionPolicy: 'TERMINAL_COMMAND_AUTO_EXECUTION_POLICY_PROCEED_IN_SANDBOX',
      },
      browserConfig: {
        browserEnabled: true,
        javascriptExecutionPolicy: 'JAVASCRIPT_EXECUTION_POLICY_REQUEST_REVIEW',
        actuationAllowedUrls: ['https://console.cloud.google.com'],
      },
      featureConfig: {
        remoteControlEnabled: false,
        multiagentConfig: {
          boostCommandDisabled: false,
          teamworkPreviewCommandDisabled: false,
        },
      },
      pluginConfig: {
        pluginsDisabled: false,
        marketplaceDisabled: true,
      },
      mcpConfig: {
        mcpEnabled: true,
        mcpAllowlist: { bigquery: { url: 'https://bigquery.googleapis.com/mcp' } },
      },
      modelConfig: {
        allowedModels: ['gemini-4-neon'],
        allowedThirdPartyModels: ['claude-sonnet-5-5'],
      },
      residencyConfig: {
        fallbackEnabledLocationIds: ['ca', 'europe-west2'],
      },
      loggingConfig: {
        metadataLoggingEnabled: true,
        promptAndResponseLoggingEnabled: false,
      },
    });
  });

  describe('Pure Validators — Negative & Adversarial Coverage', () => {
    it('validates https:// actuation URLs and rejects http://, javascript:, credentials, and bare domains', () => {
      const ok = parseAndValidateActuationUrls(
        'https://console.cloud.google.com,\nhttps://*.corp.example.com/app, https://localhost:8443',
      );
      expect(ok.valid).toBe(true);
      expect(ok.urls).toEqual([
        'https://console.cloud.google.com',
        'https://*.corp.example.com/app',
        'https://localhost:8443',
      ]);

      for (const hostile of [
        'http://insecure.example.com',
        'javascript:alert(1)',
        'file:///etc/passwd',
        'https://user:secret@example.com',
        'not-a-valid-url',
        'https://..invalid..',
      ]) {
        const res = parseAndValidateActuationUrls(hostile);
        expect(res.valid).toBe(false);
        expect(res.invalidUrls).toContain(hostile);
        expect(res.error).toMatch(/Invalid actuation URL/i);
      }
    });

    it('accepts valid JSON objects for mcpAllowlist and rejects syntax errors, arrays, null, and primitives', () => {
      expect(validateMcpAllowlistJson('{}')).toEqual({ valid: true, value: {} });
      expect(validateMcpAllowlistJson('{"srv":{"transport":"sse"}}')).toEqual({
        valid: true,
        value: { srv: { transport: 'sse' } },
      });

      for (const bad of ['', '   ', '{unterminated', '["array"]', 'null', '"string"', '42', 'true']) {
        const res = validateMcpAllowlistJson(bad);
        expect(res.valid).toBe(false);
        expect(res.error).toBeDefined();
      }
    });

    it('enforces unique subscriptionTier in UserStore licenseAssignmentTierRules', () => {
      const validRules = validateLicenseAssignmentTierRules([
        {
          subscriptionTier: 'GEMINI_ENTERPRISE_PLUS',
          licenseConfig: 'projects/1/locations/global/licenseConfigs/plus-1',
          allowedUserGroups: ['eng@example.com'],
        },
        {
          subscriptionTier: 'GEMINI_ENTERPRISE',
          licenseConfig: 'projects/1/locations/global/licenseConfigs/std-1',
        },
      ]);
      expect(validRules.valid).toBe(true);

      const dupRules = validateLicenseAssignmentTierRules([
        {
          subscriptionTier: 'GEMINI_ENTERPRISE_PLUS',
          licenseConfig: 'projects/1/locations/global/licenseConfigs/plus-1',
        },
        {
          subscriptionTier: 'GEMINI_ENTERPRISE_PLUS',
          licenseConfig: 'projects/1/locations/global/licenseConfigs/plus-2',
        },
      ]);
      expect(dupRules.valid).toBe(false);
      expect(dupRules.duplicateTiers).toContain('GEMINI_ENTERPRISE_PLUS');
      expect(dupRules.error).toMatch(/Duplicate subscriptionTier/i);
    });
  });

  describe('DevToolsPage Behavioral & Adversarial Flows', () => {
    it('renders Gemini Code Assist sunset banner, enrollment notice, hydrates all fields, and saves PATCH payload', async () => {
      mockedApi.updateDevToolsConfig.mockImplementation(async (payload) => ({
        name: 'projects/ent-prod-999/locations/global/devToolsConfig',
        ...payload,
      }));

      renderWithEnrollment(<DevToolsPage projectNumber="999888777" projectId="ent-prod-999" />);

      // Verify Code Assist Oct 9, 2026 / March 31, 2027 sunset banner & enrollment readiness notice
      expect(screen.getByTestId('code-assist-sunset-banner')).toHaveTextContent(/October 9, 2026/);
      expect(screen.getByTestId('code-assist-sunset-banner')).toHaveTextContent(/March 31, 2027/);
      expect(screen.getByTestId('code-assist-sunset-banner')).toHaveTextContent(/Google Antigravity/);
      expect(screen.getByTestId('devtools-enrollment-notice')).toHaveTextContent(/GOOGLE_INTERNAL Enrolled/);

      await waitFor(() => {
        expect(mockedApi.getDevToolsConfig).toHaveBeenCalledWith({
          projectId: 'ent-prod-999',
          appLocation: 'global',
        });
      });

      // Toggle /teamwork & /swarm off -> sets teamworkPreviewCommandDisabled: true
      fireEvent.click(screen.getByTestId('teamwork-swarm-toggle'));
      // Add 1P model gemini-4-hydrogen and 3P model claude-opus-5-5 and fallback location sg
      fireEvent.click(screen.getByTestId('model-chip-1p-gemini-4-hydrogen'));
      fireEvent.click(screen.getByTestId('model-chip-3p-claude-opus-5-5'));
      fireEvent.click(screen.getByTestId('fallback-loc-chip-sg'));

      // Live cURL preview reflects global residencyConfig and teamworkPreviewCommandDisabled
      expect(screen.getByTestId('devtools-patch-curl')).toHaveTextContent(
        /"teamworkPreviewCommandDisabled": true/,
      );

      fireEvent.click(screen.getByTestId('save-devtools-config-btn'));

      await waitFor(() => {
        expect(mockedApi.updateDevToolsConfig).toHaveBeenCalledTimes(1);
      });

      const [sentPayload, sentMask, sentCfg] = mockedApi.updateDevToolsConfig.mock.calls[0];
      expect(sentCfg).toEqual({ projectId: 'ent-prod-999', appLocation: 'global' });
      expect(sentMask).toContain('residencyConfig');
      expect(sentPayload.featureConfig?.multiagentConfig?.teamworkPreviewCommandDisabled).toBe(true);
      expect(sentPayload.modelConfig?.allowedModels).toEqual([
        'gemini-4-neon',
        'gemini-4-hydrogen',
      ]);
      expect(sentPayload.modelConfig?.allowedThirdPartyModels).toEqual([
        'claude-sonnet-5-5',
        'claude-opus-5-5',
      ]);
      expect(sentPayload.residencyConfig?.fallbackEnabledLocationIds).toEqual([
        'ca',
        'europe-west2',
        'sg',
      ]);
      expect(await screen.findByTestId('devtools-save-success')).toBeInTheDocument();
    });

    it('blocks saving and displays explicit alerts when actuation URLs or MCP allowlist JSON are invalid', async () => {
      renderWithEnrollment(<DevToolsPage projectNumber="999888777" projectId="ent-prod-999" />);
      await waitFor(() => expect(mockedApi.getDevToolsConfig).toHaveBeenCalled());

      const saveBtn = screen.getByTestId('save-devtools-config-btn') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);

      // Enter insecure http:// actuation URL
      fireEvent.change(screen.getByTestId('actuation-allowed-urls-input'), {
        target: { value: 'http://evil.example.com' },
      });
      expect(screen.getByTestId('actuation-urls-error')).toHaveTextContent(
        /Every entry must be a valid https:\/\/ URL/i,
      );
      expect(saveBtn.disabled).toBe(true);

      // Fix URL, then enter array instead of JSON object in MCP allowlist
      fireEvent.change(screen.getByTestId('actuation-allowed-urls-input'), {
        target: { value: 'https://valid.example.com' },
      });
      fireEvent.change(screen.getByTestId('mcp-allowlist-input'), {
        target: { value: '["array-not-allowed"]' },
      });
      expect(screen.getByTestId('mcp-allowlist-error')).toHaveTextContent(
        /must be a JSON object/i,
      );
      expect(saveBtn.disabled).toBe(true);
      expect(mockedApi.updateDevToolsConfig).not.toHaveBeenCalled();
    });

    it('omits residencyConfig when location is switched to a regional endpoint and surfaces 403 API errors honestly', async () => {
      renderWithEnrollment(<DevToolsPage projectNumber="999888777" projectId="ent-prod-999" />);
      await waitFor(() => expect(mockedApi.getDevToolsConfig).toHaveBeenCalledTimes(1));

      mockedApi.getDevToolsConfig.mockRejectedValueOnce(
        new Error('403 PERMISSION_DENIED: discoveryengine.devToolsConfigs.get denied'),
      );

      fireEvent.change(screen.getByLabelText(/Gemini Enterprise Location/i), {
        target: { value: 'europe-west2' },
      });

      expect(screen.queryByTestId('global-residency-fallback-section')).not.toBeInTheDocument();
      const errBanner = await screen.findByTestId('devtools-error-banner');
      expect(errBanner).toHaveTextContent(/403 PERMISSION_DENIED/);
    });
  });

  describe('UserStoreConfigTab & AllocationsTab Enhancements', () => {
    it('renders UserStore & ProjectOverageConfig, blocks duplicate subscriptionTier rules, and saves valid updates', async () => {
      mockedApi.getUserStore.mockResolvedValue({
        name: 'projects/999888777/locations/global/userStores/default_user_store',
        enableLicenseAutoRegister: true,
        defaultLicenseConfig: 'projects/999888777/locations/global/licenseConfigs/cfg-std',
        enableExpiredLicenseAutoUpdate: true,
        licenseAutoRegisterAllowedGroups: ['devs@example.com'],
        licenseAssignmentTierRules: [
          {
            subscriptionTier: 'GEMINI_ENTERPRISE_PLUS',
            licenseConfig: 'projects/999888777/locations/global/licenseConfigs/cfg-plus',
            allowedUserGroups: ['staff@example.com'],
          },
        ],
      });
      mockedApi.getProjectOverageConfig.mockResolvedValue({
        name: 'projects/999888777/locations/global/projectOverageConfig',
        prepayWalletRequired: true,
        tierOverageConfigs: [
          { subscriptionTier: 'GEMINI_ENTERPRISE', priorityPaygEnabled: true },
        ],
      });
      mockedApi.updateUserStore.mockImplementation(async (store) => ({
        name: 'projects/999888777/locations/global/userStores/default_user_store',
        ...store,
      }));
      mockedApi.updateProjectOverageConfig.mockImplementation(async (cfg) => ({
        name: 'projects/999888777/locations/global/projectOverageConfig',
        prepayWalletRequired: true,
        ...cfg,
      }));

      renderWithEnrollment(
        <UserStoreConfigTab
          projectNumber="999888777"
          appLocation="global"
          userStoreId="default_user_store"
          apiLicenseConfigs={[
            {
              name: 'projects/999888777/locations/global/licenseConfigs/cfg-std',
              displayName: 'Standard Pool',
              subscriptionTier: 'GEMINI_ENTERPRISE',
            },
            {
              name: 'projects/999888777/locations/global/licenseConfigs/cfg-plus',
              displayName: 'Plus Pool',
              subscriptionTier: 'GEMINI_ENTERPRISE_PLUS',
            },
          ]}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('prepay-wallet-badge')).toHaveTextContent(
          /Prepay Wallet Required/,
        );
      });

      // Add a second rule and force duplicate GEMINI_ENTERPRISE_PLUS tier -> must block save
      fireEvent.click(screen.getByTestId('add-tier-rule-btn'));
      fireEvent.change(screen.getByLabelText('Rule 2 Subscription Tier'), {
        target: { value: 'GEMINI_ENTERPRISE_PLUS' },
      });

      expect(screen.getByTestId('tier-rules-validation-error')).toHaveTextContent(
        /Duplicate subscriptionTier detected/i,
      );
      expect((screen.getByTestId('save-userstore-btn') as HTMLButtonElement).disabled).toBe(true);

      // Change Rule 2 to unique GEMINI_ENTERPRISE tier and save both UserStore and ProjectOverageConfig
      fireEvent.change(screen.getByLabelText('Rule 2 Subscription Tier'), {
        target: { value: 'GEMINI_ENTERPRISE' },
      });
      expect(screen.queryByTestId('tier-rules-validation-error')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('save-userstore-btn'));
      await waitFor(() => expect(mockedApi.updateUserStore).toHaveBeenCalledTimes(1));

      fireEvent.click(screen.getByTestId('save-overage-config-btn'));
      await waitFor(() => expect(mockedApi.updateProjectOverageConfig).toHaveBeenCalledTimes(1));
    });

    it('displays 7-Day Grace Period badge on DEACTIVATING billing configs and once-per-day retraction notice in AllocationsTab', () => {
      render(
        <AllocationsTab
          projectNumber="999888777"
          billingAccountId="01ABCD-234567-89EF01"
          setBillingAccountId={vi.fn()}
          availableBillingAccounts={[
            { name: 'billingAccounts/01ABCD-234567-89EF01', displayName: 'Enterprise Billing' },
          ]}
          isBillingAccountsLoading={false}
          hasBillingPermission={true}
          setHasBillingPermission={vi.fn()}
          isBillingLoading={false}
          billingConfigs={[
            {
              name: 'billingAccounts/01ABCD-234567-89EF01/billingAccountLicenseConfigs/cfg-1',
              displayName: 'Legacy Standard Pool',
              licenseCount: 50,
              subscriptionTier: 'GEMINI_ENTERPRISE',
              state: 'DEACTIVATING',
              licenseConfigDistributions: {
                'projects/999888777/locations/global/licenseConfigs/local-1': '25',
              },
            },
          ]}
          setBillingConfigs={vi.fn()}
          projectNames={{ '999888777': 'Prod Project' }}
          fetchBillingConfigs={vi.fn()}
          setDistributeModalProps={vi.fn()}
          setRetractModalProps={vi.fn()}
        />,
      );

      expect(screen.getByTestId('deactivating-grace-badge')).toHaveTextContent(
        /7-Day Grace Period/i,
      );
      expect(screen.getByText(/once per day/i)).toBeInTheDocument();
      const retractBtn = screen.getByRole('button', { name: /Retract/i });
      expect(retractBtn.getAttribute('title')).toMatch(/once per day/i);
    });
  });
});
