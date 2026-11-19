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

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as api from '../../services/apiService';
import {
  LicenseAssignmentTierRule,
  ProjectOverageConfig,
  TierOverageConfig,
  UserStore,
} from '../../types';
import { LicenseConfig } from './types';
import { useProjectEnrollment } from '../../context/ProjectEnrollmentContext';
import { toErrorMessage } from '../../utils/errors';

export interface UserStoreConfigTabProps {
  projectNumber: string;
  appLocation: string;
  userStoreId: string;
  apiLicenseConfigs: LicenseConfig[];
}

export const KNOWN_SUBSCRIPTION_TIERS: Array<{ value: string; label: string }> = [
  { value: 'GEMINI_ENTERPRISE', label: 'GEMINI_ENTERPRISE (Standard)' },
  { value: 'GEMINI_ENTERPRISE_PLUS', label: 'GEMINI_ENTERPRISE_PLUS (Plus)' },
  { value: 'GEMINI_ENTERPRISE_EMERGING', label: 'GEMINI_ENTERPRISE_EMERGING (Standard Emerging Market)' },
  { value: 'GEMINI_ENTERPRISE_EDU', label: 'GEMINI_ENTERPRISE_EDU (EDU)' },
  { value: 'GEMINI_ENTERPRISE_EDU_PRO', label: 'GEMINI_ENTERPRISE_EDU_PRO (EDU Pro)' },
  { value: 'GEMINI_ENTERPRISE_FRONTLINE_WORKER', label: 'GEMINI_ENTERPRISE_FRONTLINE_WORKER (Frontline Worker)' },
  { value: 'GEMINI_ENTERPRISE_FRONTLINE_STARTER', label: 'GEMINI_ENTERPRISE_FRONTLINE_STARTER (Frontline Starter)' },
  { value: 'SUBSCRIPTION_TIER_CONSUMPTION_ONLY', label: 'SUBSCRIPTION_TIER_CONSUMPTION_ONLY (Pay-As-You-Go)' },
];

export interface TierRuleValidationResult {
  valid: boolean;
  duplicateTiers: string[];
  error?: string;
}

/**
 * Enforces unique `subscriptionTier` across ordered `licenseAssignmentTierRules` per Discovery Engine UserStore proto rules,
 * and ensures every configured rule specifies both a `subscriptionTier` and `licenseConfig`.
 */
export function validateLicenseAssignmentTierRules(
  rules: LicenseAssignmentTierRule[],
): TierRuleValidationResult {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const tier = (rule.subscriptionTier || '').trim();
    const cfg = (rule.licenseConfig || '').trim();

    if (!tier) {
      return {
        valid: false,
        duplicateTiers: [],
        error: `Tier Rule #${i + 1} is missing a subscriptionTier.`,
      };
    }
    if (!cfg) {
      return {
        valid: false,
        duplicateTiers: [],
        error: `Tier Rule #${i + 1} (${tier}) must select an active LicenseConfig.`,
      };
    }
    const normalizedTier = tier.toUpperCase();
    if (seen.has(normalizedTier)) {
      duplicates.add(tier);
    }
    seen.add(normalizedTier);
  }

  if (duplicates.size > 0) {
    const duplicateList = Array.from(duplicates);
    return {
      valid: false,
      duplicateTiers: duplicateList,
      error: `Duplicate subscriptionTier detected (${duplicateList.join(', ')}). UserStore proto rules require each subscriptionTier to appear at most once.`,
    };
  }

  return { valid: true, duplicateTiers: [] };
}

function parseGroupsInput(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,]+/)
        .map((g) => g.trim())
        .filter((g) => g.length > 0),
    ),
  );
}

const DEFAULT_OVERAGE_TIERS = [
  'GEMINI_ENTERPRISE',
  'GEMINI_ENTERPRISE_PLUS',
  'GEMINI_ENTERPRISE_EMERGING',
  'SUBSCRIPTION_TIER_CONSUMPTION_ONLY',
];

export const UserStoreConfigTab: React.FC<UserStoreConfigTabProps> = ({
  projectNumber,
  appLocation,
  userStoreId,
  apiLicenseConfigs,
}) => {
  const { isGoogleInternal, isTrustedTester } = useProjectEnrollment();

  // UserStore state
  const [isLoadingUserStore, setIsLoadingUserStore] = useState<boolean>(false);
  const [isSavingUserStore, setIsSavingUserStore] = useState<boolean>(false);
  const [userStoreError, setUserStoreError] = useState<string | null>(null);
  const [userStoreSuccess, setUserStoreSuccess] = useState<string | null>(null);

  const [enableLicenseAutoRegister, setEnableLicenseAutoRegister] = useState<boolean>(false);
  const [defaultLicenseConfig, setDefaultLicenseConfig] = useState<string>('');
  const [enableExpiredLicenseAutoUpdate, setEnableExpiredLicenseAutoUpdate] =
    useState<boolean>(false);
  const [allowedGroupsText, setAllowedGroupsText] = useState<string>('');
  const [tierRules, setTierRules] = useState<LicenseAssignmentTierRule[]>([]);
  const [tierRuleGroupsRaw, setTierRuleGroupsRaw] = useState<string[]>([]);

  // ProjectOverageConfig state
  const [isLoadingOverage, setIsLoadingOverage] = useState<boolean>(false);
  const [isSavingOverage, setIsSavingOverage] = useState<boolean>(false);
  const [overageError, setOverageError] = useState<string | null>(null);
  const [overageSuccess, setOverageSuccess] = useState<string | null>(null);
  const [prepayWalletRequired, setPrepayWalletRequired] = useState<boolean | undefined>(undefined);
  const [tierOverageConfigs, setTierOverageConfigs] = useState<TierOverageConfig[]>(
    DEFAULT_OVERAGE_TIERS.map((tier) => ({
      subscriptionTier: tier,
      priorityPaygEnabled: false,
    })),
  );
  const [newOverageTier, setNewOverageTier] = useState<string>('');

  const hydrateUserStore = useCallback((store: UserStore) => {
    setEnableLicenseAutoRegister(Boolean(store.enableLicenseAutoRegister));
    setDefaultLicenseConfig(store.defaultLicenseConfig || '');
    setEnableExpiredLicenseAutoUpdate(Boolean(store.enableExpiredLicenseAutoUpdate));
    setAllowedGroupsText((store.licenseAutoRegisterAllowedGroups || []).join('\n'));
    const rules = store.licenseAssignmentTierRules || [];
    setTierRules(rules);
    setTierRuleGroupsRaw(rules.map((r) => (r.allowedUserGroups || []).join(', ')));
  }, []);

  const hydrateOverageConfig = useCallback((cfg: ProjectOverageConfig) => {
    setPrepayWalletRequired(cfg.prepayWalletRequired);
    const existing = cfg.tierOverageConfigs || [];
    const mergedMap = new Map<string, boolean>();
    for (const defaultTier of DEFAULT_OVERAGE_TIERS) {
      mergedMap.set(defaultTier, false);
    }
    for (const item of existing) {
      if (item.subscriptionTier) {
        mergedMap.set(item.subscriptionTier, Boolean(item.priorityPaygEnabled));
      }
    }
    setTierOverageConfigs(
      Array.from(mergedMap.entries()).map(([subscriptionTier, priorityPaygEnabled]) => ({
        subscriptionTier,
        priorityPaygEnabled,
      })),
    );
  }, []);

  const loadPolicies = useCallback(async () => {
    if (!projectNumber) return;
    setIsLoadingUserStore(true);
    setIsLoadingOverage(true);
    setUserStoreError(null);
    setOverageError(null);
    setUserStoreSuccess(null);
    setOverageSuccess(null);

    const cfg = { projectId: projectNumber, appLocation };

    const [storeRes, overageRes] = await Promise.allSettled([
      api.getUserStore(cfg, userStoreId),
      api.getProjectOverageConfig(cfg, true),
    ]);

    if (storeRes.status === 'fulfilled') {
      hydrateUserStore(storeRes.value || ({ name: '' } as UserStore));
    } else {
      setUserStoreError(`Failed to fetch UserStore (${userStoreId}): ${toErrorMessage(storeRes.reason)}`);
    }
    setIsLoadingUserStore(false);

    if (overageRes.status === 'fulfilled') {
      hydrateOverageConfig(overageRes.value || {});
    } else {
      const msg = toErrorMessage(overageRes.reason);
      setOverageError(`Failed to fetch ProjectOverageConfig: ${msg}`);
    }
    setIsLoadingOverage(false);
  }, [projectNumber, appLocation, userStoreId, hydrateUserStore, hydrateOverageConfig]);

  useEffect(() => {
    void loadPolicies();
  }, [loadPolicies]);

  const tierRuleValidation = useMemo(
    () => validateLicenseAssignmentTierRules(tierRules),
    [tierRules],
  );

  const handleAddTierRule = () => {
    const usedTiers = new Set(tierRules.map((r) => r.subscriptionTier.toUpperCase()));
    const nextAvailable =
      KNOWN_SUBSCRIPTION_TIERS.find((t) => !usedTiers.has(t.value.toUpperCase()))?.value || '';
    const defaultCfg = apiLicenseConfigs[0]?.name || '';
    setTierRules([
      ...tierRules,
      {
        subscriptionTier: nextAvailable,
        licenseConfig: defaultCfg,
        allowedUserGroups: [],
      },
    ]);
    setTierRuleGroupsRaw([...tierRuleGroupsRaw, '']);
  };

  const handleRemoveTierRule = (idx: number) => {
    setTierRules(tierRules.filter((_, i) => i !== idx));
    setTierRuleGroupsRaw(tierRuleGroupsRaw.filter((_, i) => i !== idx));
  };

  const handleMoveTierRule = (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= tierRules.length) return;
    const nextRules = [...tierRules];
    const nextGroups = [...tierRuleGroupsRaw];
    [nextRules[idx], nextRules[target]] = [nextRules[target], nextRules[idx]];
    [nextGroups[idx], nextGroups[target]] = [nextGroups[target], nextGroups[idx]];
    setTierRules(nextRules);
    setTierRuleGroupsRaw(nextGroups);
  };

  const handleUpdateTierRuleField = (
    idx: number,
    field: 'subscriptionTier' | 'licenseConfig',
    value: string,
  ) => {
    setTierRules((prev) =>
      prev.map((rule, i) => (i === idx ? { ...rule, [field]: value } : rule)),
    );
  };

  const handleUpdateTierRuleGroups = (idx: number, raw: string) => {
    setTierRuleGroupsRaw((prev) => prev.map((val, i) => (i === idx ? raw : val)));
    const parsedGroups = parseGroupsInput(raw);
    setTierRules((prev) =>
      prev.map((rule, i) => (i === idx ? { ...rule, allowedUserGroups: parsedGroups } : rule)),
    );
  };

  const handleSaveUserStore = async () => {
    setUserStoreError(null);
    setUserStoreSuccess(null);

    if (!projectNumber) {
      setUserStoreError('Project ID / Number is required.');
      return;
    }
    if (!tierRuleValidation.valid) {
      setUserStoreError(tierRuleValidation.error || 'Invalid license assignment tier rules.');
      return;
    }

    setIsSavingUserStore(true);
    try {
      const allowedGroups = parseGroupsInput(allowedGroupsText);
      const payload: Partial<UserStore> = {
        enableLicenseAutoRegister,
        defaultLicenseConfig,
        enableExpiredLicenseAutoUpdate,
      };
      const updateMask = [
        'enableLicenseAutoRegister',
        'defaultLicenseConfig',
        'enableExpiredLicenseAutoUpdate',
      ];

      if (isGoogleInternal || allowedGroups.length > 0 || tierRules.length > 0) {
        payload.licenseAutoRegisterAllowedGroups = allowedGroups;
        payload.licenseAssignmentTierRules = tierRules;
        updateMask.push('licenseAutoRegisterAllowedGroups', 'licenseAssignmentTierRules');
      }

      const updated = await api.updateUserStore(
        payload,
        updateMask,
        { projectId: projectNumber, appLocation },
        userStoreId,
      );
      hydrateUserStore(updated);
      setUserStoreSuccess(`Updated UserStore (${userStoreId}) in ${appLocation}.`);
    } catch (err: unknown) {
      setUserStoreError(`Failed to update UserStore: ${toErrorMessage(err)}`);
    } finally {
      setIsSavingUserStore(false);
    }
  };

  const handleToggleOverageTier = (tier: string, enabled: boolean) => {
    setTierOverageConfigs((prev) =>
      prev.map((item) =>
        item.subscriptionTier === tier ? { ...item, priorityPaygEnabled: enabled } : item,
      ),
    );
  };

  const handleAddOverageTier = () => {
    const trimmed = newOverageTier.trim();
    if (!trimmed) return;
    if (tierOverageConfigs.some((t) => t.subscriptionTier.toUpperCase() === trimmed.toUpperCase())) {
      setOverageError(`Subscription tier "${trimmed}" is already listed in tierOverageConfigs.`);
      return;
    }
    setOverageError(null);
    setTierOverageConfigs([
      ...tierOverageConfigs,
      { subscriptionTier: trimmed, priorityPaygEnabled: true },
    ]);
    setNewOverageTier('');
  };

  const handleSaveOverageConfig = async () => {
    setOverageError(null);
    setOverageSuccess(null);

    if (!projectNumber) {
      setOverageError('Project ID / Number is required.');
      return;
    }

    setIsSavingOverage(true);
    try {
      const updated = await api.updateProjectOverageConfig(
        { tierOverageConfigs },
        ['tierOverageConfigs'],
        { projectId: projectNumber, appLocation },
      );
      hydrateOverageConfig(updated);
      setOverageSuccess(`Updated ProjectOverageConfig PAYG policy in ${appLocation}.`);
    } catch (err: unknown) {
      setOverageError(`Failed to update ProjectOverageConfig: ${toErrorMessage(err)}`);
    } finally {
      setIsSavingOverage(false);
    }
  };

  const availableConfigOptions = useMemo(() => {
    const names = new Set(apiLicenseConfigs.map((c) => c.name));
    const extras: LicenseConfig[] = [];
    if (defaultLicenseConfig && !names.has(defaultLicenseConfig)) {
      extras.push({ name: defaultLicenseConfig, displayName: `${defaultLicenseConfig.split('/').pop()} (current)` });
    }
    for (const rule of tierRules) {
      if (rule.licenseConfig && !names.has(rule.licenseConfig) && !extras.some((e) => e.name === rule.licenseConfig)) {
        extras.push({ name: rule.licenseConfig, displayName: `${rule.licenseConfig.split('/').pop()} (current)` });
      }
    }
    return [...apiLicenseConfigs, ...extras];
  }, [apiLicenseConfigs, defaultLicenseConfig, tierRules]);

  return (
    <div className="space-y-6">
      {/* Section 1: UserStore Auto-Licensing & Tier Rules */}
      <section className="bg-gray-800 border border-gray-700 rounded-lg p-6 shadow-md space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-700 pb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">
              UserStore Auto-Registration &amp; Tier Rules
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Resource:{' '}
              <code className="font-mono text-gray-300">
                projects/{projectNumber || '{project}'}/locations/{appLocation}/userStores/{userStoreId}
              </code>
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => void loadPolicies()}
              disabled={isLoadingUserStore || !projectNumber}
              className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 border border-gray-600 text-xs font-medium text-gray-200 disabled:opacity-50"
            >
              {isLoadingUserStore ? 'Loading...' : 'Refresh'}
            </button>
            <button
              type="button"
              data-testid="save-userstore-btn"
              onClick={() => void handleSaveUserStore()}
              disabled={
                isLoadingUserStore ||
                isSavingUserStore ||
                !projectNumber ||
                !tierRuleValidation.valid
              }
              className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              {isSavingUserStore ? 'Saving...' : 'Save UserStore Policy'}
            </button>
          </div>
        </div>

        {userStoreError && (
          <div
            role="alert"
            data-testid="userstore-error-banner"
            className="bg-red-900/30 border border-red-800 rounded p-3 text-sm text-red-200"
          >
            {userStoreError}
          </div>
        )}

        {userStoreSuccess && (
          <div
            role="status"
            className="bg-green-900/30 border border-green-800 rounded p-3 text-sm text-green-200"
          >
            {userStoreSuccess}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center justify-between gap-3 p-4 rounded-lg bg-gray-900/60 border border-gray-700 cursor-pointer">
            <div>
              <span className="text-sm font-semibold text-gray-100 block">
                Auto-Register Licenses on First Login (<code className="text-xs font-mono text-blue-300">enableLicenseAutoRegister</code>)
              </span>
              <span className="text-xs text-gray-400">
                Automatically assigns a seat from <code className="font-mono">defaultLicenseConfig</code> (or matching tier rules) when an unlicensed user signs into Gemini Enterprise.
              </span>
            </div>
            <input
              type="checkbox"
              aria-label="Auto-Register Licenses on First Login"
              checked={enableLicenseAutoRegister}
              onChange={(e) => setEnableLicenseAutoRegister(e.target.checked)}
              className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600"
            />
          </label>

          <label className="flex items-center justify-between gap-3 p-4 rounded-lg bg-gray-900/60 border border-gray-700 cursor-pointer">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-100">
                  Auto-Update Expired Licenses (<code className="text-xs font-mono text-blue-300">enableExpiredLicenseAutoUpdate</code>)
                </span>
                <span className="px-1.5 py-0.5 rounded bg-blue-900/60 border border-blue-700 text-[10px] font-semibold text-blue-200">
                  GA
                </span>
              </div>
              <span className="text-xs text-gray-400 block mt-0.5">
                Automatically migrates users assigned to an expired <code className="font-mono">LicenseConfig</code> onto an active replacement subscription pool.
              </span>
            </div>
            <input
              type="checkbox"
              aria-label="Auto-Update Expired Licenses"
              checked={enableExpiredLicenseAutoUpdate}
              onChange={(e) => setEnableExpiredLicenseAutoUpdate(e.target.checked)}
              className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600"
            />
          </label>
        </div>

        <div>
          <label
            htmlFor="default-license-config-select"
            className="block text-xs font-semibold text-gray-300 mb-1"
          >
            Default License Config (<code className="font-mono">defaultLicenseConfig</code>)
          </label>
          <select
            id="default-license-config-select"
            aria-label="Default License Config"
            value={defaultLicenseConfig}
            onChange={(e) => setDefaultLicenseConfig(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- No Default LicenseConfig Selected --</option>
            {availableConfigOptions.map((cfg) => (
              <option key={cfg.name} value={cfg.name}>
                {cfg.displayName || cfg.name.split('/').pop()} — {cfg.subscriptionTier || 'Standard'} ({cfg.name})
              </option>
            ))}
          </select>
        </div>

        {/* GOOGLE_INTERNAL Group & Ordered Tier Rules */}
        <div className="pt-4 border-t border-gray-700 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-gray-200">
                Group Allowlist &amp; Ordered Tier Assignment Rules
              </h4>
              <span className="px-2 py-0.5 rounded bg-purple-900/50 border border-purple-700 text-[11px] font-mono text-purple-200">
                GOOGLE_INTERNAL
              </span>
              {!isGoogleInternal && !isTrustedTester && (
                <span className="text-[11px] text-amber-300">
                  (Requires GOOGLE_INTERNAL project allowlist on v1alpha)
                </span>
              )}
            </div>
            <button
              type="button"
              data-testid="add-tier-rule-btn"
              onClick={handleAddTierRule}
              className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 border border-gray-600 text-xs font-medium text-white"
            >
              + Add Tier Rule
            </button>
          </div>

          <div>
            <label
              htmlFor="auto-register-allowed-groups"
              className="block text-xs font-semibold text-gray-300 mb-1"
            >
              Auto-Register Allowed Groups (<code className="font-mono">licenseAutoRegisterAllowedGroups</code> — comma or newline separated)
            </label>
            <textarea
              id="auto-register-allowed-groups"
              aria-label="Auto-Register Allowed Groups"
              rows={2}
              value={allowedGroupsText}
              onChange={(e) => setAllowedGroupsText(e.target.value)}
              placeholder="eng-all@example.com, product-team@example.com"
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-xs font-mono text-gray-100 placeholder-gray-500"
            />
          </div>

          {!tierRuleValidation.valid && (
            <div
              role="alert"
              data-testid="tier-rules-validation-error"
              className="bg-red-900/30 border border-red-800 rounded p-2.5 text-xs text-red-200"
            >
              {tierRuleValidation.error}
            </div>
          )}

          {tierRules.length === 0 ? (
            <p className="text-xs text-gray-400 italic">
              No ordered <code className="font-mono">licenseAssignmentTierRules</code> configured. Click &ldquo;+ Add Tier Rule&rdquo; to evaluate group-based tier routing in priority order.
            </p>
          ) : (
            <div className="space-y-3">
              {tierRules.map((rule, idx) => (
                <div
                  key={idx}
                  data-testid={`tier-rule-row-${idx}`}
                  className="bg-gray-900/70 border border-gray-700 rounded-lg p-3.5 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-blue-300">
                      Priority #{idx + 1}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleMoveTierRule(idx, -1)}
                        disabled={idx === 0}
                        className="px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-xs text-gray-300 disabled:opacity-40"
                        title="Move rule up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveTierRule(idx, 1)}
                        disabled={idx === tierRules.length - 1}
                        className="px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-xs text-gray-300 disabled:opacity-40"
                        title="Move rule down"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveTierRule(idx)}
                        className="px-2 py-0.5 rounded bg-red-900/40 hover:bg-red-900/70 border border-red-800 text-xs text-red-300"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-gray-400 mb-1">
                        Subscription Tier (Unique)
                      </label>
                      <select
                        aria-label={`Rule ${idx + 1} Subscription Tier`}
                        value={rule.subscriptionTier}
                        onChange={(e) =>
                          handleUpdateTierRuleField(idx, 'subscriptionTier', e.target.value)
                        }
                        className="w-full bg-gray-800 border border-gray-600 rounded px-2.5 py-1.5 text-xs text-white"
                      >
                        <option value="">-- Select Tier --</option>
                        {KNOWN_SUBSCRIPTION_TIERS.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                        {rule.subscriptionTier &&
                          !KNOWN_SUBSCRIPTION_TIERS.some(
                            (t) => t.value === rule.subscriptionTier,
                          ) && (
                            <option value={rule.subscriptionTier}>
                              {rule.subscriptionTier}
                            </option>
                          )}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-gray-400 mb-1">
                        Target Project LicenseConfig
                      </label>
                      {availableConfigOptions.length > 0 ? (
                        <select
                          aria-label={`Rule ${idx + 1} License Config`}
                          value={rule.licenseConfig}
                          onChange={(e) =>
                            handleUpdateTierRuleField(idx, 'licenseConfig', e.target.value)
                          }
                          className="w-full bg-gray-800 border border-gray-600 rounded px-2.5 py-1.5 text-xs text-white"
                        >
                          <option value="">-- Select LicenseConfig --</option>
                          {availableConfigOptions.map((cfg) => (
                            <option key={cfg.name} value={cfg.name}>
                              {cfg.displayName || cfg.name.split('/').pop()} ({cfg.name})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          aria-label={`Rule ${idx + 1} License Config`}
                          value={rule.licenseConfig}
                          onChange={(e) =>
                            handleUpdateTierRuleField(idx, 'licenseConfig', e.target.value)
                          }
                          placeholder={`projects/${projectNumber || '123'}/locations/${appLocation}/licenseConfigs/...`}
                          className="w-full bg-gray-800 border border-gray-600 rounded px-2.5 py-1.5 text-xs font-mono text-white"
                        />
                      )}
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-gray-400 mb-1">
                        Allowed User Groups (comma-separated)
                      </label>
                      <input
                        type="text"
                        aria-label={`Rule ${idx + 1} Allowed User Groups`}
                        value={tierRuleGroupsRaw[idx] ?? ''}
                        onChange={(e) => handleUpdateTierRuleGroups(idx, e.target.value)}
                        placeholder="ai-power-users@example.com"
                        className="w-full bg-gray-800 border border-gray-600 rounded px-2.5 py-1.5 text-xs font-mono text-white"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Section 2: ProjectOverageConfig — Per-Tier PAYG Above-Quota Policy */}
      <section className="bg-gray-800 border border-gray-700 rounded-lg p-6 shadow-md space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-700 pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-lg font-semibold text-white">
                Project Overage Configuration (Pay-As-You-Go Above Quota)
              </h3>
              {prepayWalletRequired === true && (
                <span
                  data-testid="prepay-wallet-badge"
                  className="px-2.5 py-0.5 rounded bg-amber-900/50 border border-amber-700 text-xs font-semibold text-amber-200"
                >
                  Prepay Wallet Required
                </span>
              )}
              {prepayWalletRequired === false && (
                <span
                  data-testid="prepay-wallet-badge"
                  className="px-2.5 py-0.5 rounded bg-emerald-900/50 border border-emerald-700 text-xs font-semibold text-emerald-200"
                >
                  Postpaid Billing Eligible (No Prepay Wallet Required)
                </span>
              )}
              {prepayWalletRequired === undefined && (
                <span
                  data-testid="prepay-wallet-badge"
                  className="px-2.5 py-0.5 rounded bg-gray-700 border border-gray-600 text-xs text-gray-300"
                >
                  Wallet Eligibility Unverified
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400">
              Resource:{' '}
              <code className="font-mono text-gray-300">
                projects/{projectNumber || '{project}'}/locations/{appLocation}/projectOverageConfig
              </code>{' '}
              — Controls per-tier <code className="font-mono">priorityPaygEnabled</code> above-quota continuation.
            </p>
          </div>

          <button
            type="button"
            data-testid="save-overage-config-btn"
            onClick={() => void handleSaveOverageConfig()}
            disabled={isLoadingOverage || isSavingOverage || !projectNumber}
            className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white disabled:bg-gray-600 disabled:text-gray-400 shrink-0"
          >
            {isSavingOverage ? 'Saving...' : 'Save Overage Config'}
          </button>
        </div>

        {overageError && (
          <div
            role="alert"
            data-testid="overage-error-banner"
            className="bg-red-900/30 border border-red-800 rounded p-3 text-sm text-red-200"
          >
            {overageError}
          </div>
        )}

        {overageSuccess && (
          <div
            role="status"
            className="bg-green-900/30 border border-green-800 rounded p-3 text-sm text-green-200"
          >
            {overageSuccess}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {tierOverageConfigs.map((tierCfg) => (
            <label
              key={tierCfg.subscriptionTier}
              className="flex items-center justify-between gap-3 p-3.5 rounded-lg bg-gray-900/60 border border-gray-700 cursor-pointer"
            >
              <div>
                <span className="text-sm font-mono font-medium text-gray-100 block">
                  {tierCfg.subscriptionTier}
                </span>
                <span className="text-xs text-gray-400">
                  Enable <code className="font-mono">priorityPaygEnabled</code> when pooled tier quota is exhausted.
                </span>
              </div>
              <input
                type="checkbox"
                aria-label={`Enable PAYG overage for ${tierCfg.subscriptionTier}`}
                checked={Boolean(tierCfg.priorityPaygEnabled)}
                onChange={(e) =>
                  handleToggleOverageTier(tierCfg.subscriptionTier, e.target.checked)
                }
                className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600"
              />
            </label>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-2">
          <input
            type="text"
            value={newOverageTier}
            onChange={(e) => setNewOverageTier(e.target.value)}
            placeholder="Add custom subscriptionTier (e.g. GEMINI_ENTERPRISE_EDU_PRO)"
            className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs font-mono text-white placeholder-gray-500"
          />
          <button
            type="button"
            onClick={handleAddOverageTier}
            disabled={!newOverageTier.trim()}
            className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 border border-gray-600 text-xs text-gray-200 disabled:opacity-40"
          >
            Add Tier
          </button>
        </div>
      </section>
    </div>
  );
};

export default UserStoreConfigTab;
