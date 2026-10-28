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

import {
  AppEngine,
  EngineAgentApprovalMode,
  EngineAgentControlConfig,
  EngineDigestFrequency,
  EngineGlobalFeatureToggleState,
} from '../../../types';

/**
 * Form state for the five GOOGLE_INTERNAL top-level Engine controls
 * (engine.proto: globalFeatureToggleState, agentCreationConfig, agentControlConfig,
 * adminEmailNotificationsConfig, personalizationConfig).
 */
export interface EngineControlsState {
  releaseChannel: EngineGlobalFeatureToggleState;
  maxUserAgentCount: string;
  maxInstanceAgentCount: string;
  digestFrequency: EngineDigestFrequency;
  personalCreationEnabled: boolean;
  coworkerCreationEnabled: boolean;
  /** One principal per line (or comma-separated), e.g. `user:alice@example.com`. */
  coworkerAllowedPrincipals: string;
  coworkerSharingEnabled: boolean;
  coworkerGroupSharingEnabled: boolean;
  coworkerApprovalMode: EngineAgentApprovalMode;
  coworkerApprovalThreshold: string;
  cpiWorkspaceEnterprise: boolean;
  cpiDataCloud: boolean;
}

export const RELEASE_CHANNEL_OPTIONS: { value: EngineGlobalFeatureToggleState; label: string; description: string }[] = [
  { value: 'GLOBAL_FEATURE_TOGGLE_STATE_UNSPECIFIED', label: 'Unspecified (backend default)', description: 'Field not set; backend applies its default channel.' },
  { value: 'EARLY', label: 'Early', description: 'Early access / preview: new features turn on as soon as they are available.' },
  { value: 'GENERAL', label: 'General', description: 'New features turn on at General Availability.' },
  { value: 'SCHEDULED', label: 'Scheduled', description: 'New features turn on ~2 weeks after GA.' },
  { value: 'DELAYED', label: 'Delayed', description: 'New features turn on ~4 weeks after GA.' },
];

export const DIGEST_FREQUENCY_OPTIONS: { value: EngineDigestFrequency; label: string }[] = [
  { value: 'DIGEST_FREQUENCY_UNSPECIFIED', label: 'Unspecified (backend default)' },
  { value: 'OFF', label: 'Off' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
];

export const APPROVAL_MODE_OPTIONS: { value: EngineAgentApprovalMode; label: string }[] = [
  { value: 'APPROVAL_MODE_UNSPECIFIED', label: 'Unspecified (backend default)' },
  { value: 'ALWAYS', label: 'Always require admin approval' },
  { value: 'ABOVE_THRESHOLD', label: 'Require approval above a user-count threshold' },
  { value: 'NEVER', label: 'Never require approval' },
];

const CPI_WORKSPACE_KEY = 'workspace_enterprise';
const CPI_DATA_CLOUD_KEY = 'data_cloud';

/** Accepted IAM-style principal prefixes for coworker.allowedPrincipals. */
const PRINCIPAL_PATTERN = /^(user|group|domain|serviceAccount):[^\s:]+$|^principal(Set)?:\/\/\S+$/;

const parsePrincipals = (raw: string): string[] =>
  raw
    .split(/[\n,]/)
    .map(p => p.trim())
    .filter(Boolean);

const int64ToInput = (v: string | number | undefined): string =>
  v === undefined || v === null || v === '' ? '' : String(v);

/**
 * Derives display state from an Engine. Proto defaults (engine.proto comments):
 * personal.creationEnabled defaults to true, coworker.creationEnabled defaults to false.
 * Unset booleans elsewhere display as false.
 */
export const engineToControlsState = (engine: AppEngine): EngineControlsState => {
  const control = engine.agentControlConfig;
  const sharing = control?.coworker?.sharing;
  const cpiMap = engine.personalizationConfig?.crossProductIntelligenceClientEnabledMap;
  return {
    releaseChannel: engine.globalFeatureToggleState || 'GLOBAL_FEATURE_TOGGLE_STATE_UNSPECIFIED',
    maxUserAgentCount: int64ToInput(engine.agentCreationConfig?.maxUserAgentCount),
    maxInstanceAgentCount: int64ToInput(engine.agentCreationConfig?.maxInstanceAgentCount),
    digestFrequency: engine.adminEmailNotificationsConfig?.digestFrequency || 'DIGEST_FREQUENCY_UNSPECIFIED',
    personalCreationEnabled: control?.personal?.creationEnabled ?? true,
    coworkerCreationEnabled: control?.coworker?.creationEnabled ?? false,
    coworkerAllowedPrincipals: (control?.coworker?.allowedPrincipals || []).join('\n'),
    coworkerSharingEnabled: sharing?.sharingEnabled ?? false,
    coworkerGroupSharingEnabled: sharing?.groupSharingEnabled ?? false,
    coworkerApprovalMode: sharing?.approvalMode || 'APPROVAL_MODE_UNSPECIFIED',
    coworkerApprovalThreshold:
      sharing?.approvalThresholdUserCount === undefined ? '' : String(sharing.approvalThresholdUserCount),
    cpiWorkspaceEnterprise: cpiMap?.[CPI_WORKSPACE_KEY] ?? false,
    cpiDataCloud: cpiMap?.[CPI_DATA_CLOUD_KEY] ?? false,
  };
};

const isNonNegativeIntString = (v: string): boolean => /^\d+$/.test(v.trim());

/** Returns human-readable validation errors; an empty array means the state is valid. */
export const validateControlsState = (state: EngineControlsState): string[] => {
  const errors: string[] = [];
  if (state.maxUserAgentCount.trim() && !isNonNegativeIntString(state.maxUserAgentCount)) {
    errors.push('Max agents per user must be a non-negative whole number.');
  }
  if (state.maxInstanceAgentCount.trim() && !isNonNegativeIntString(state.maxInstanceAgentCount)) {
    errors.push('Max agents per engine must be a non-negative whole number.');
  }
  if (
    isNonNegativeIntString(state.maxUserAgentCount) &&
    isNonNegativeIntString(state.maxInstanceAgentCount) &&
    BigInt(state.maxUserAgentCount.trim()) > BigInt(state.maxInstanceAgentCount.trim())
  ) {
    errors.push('Max agents per user cannot exceed max agents per engine.');
  }
  const invalidPrincipals = parsePrincipals(state.coworkerAllowedPrincipals).filter(p => !PRINCIPAL_PATTERN.test(p));
  if (invalidPrincipals.length > 0) {
    errors.push(
      `Invalid coworker principal(s): ${invalidPrincipals.join(', ')}. Use forms like user:alice@example.com or group:admins@example.com.`,
    );
  }
  if (state.coworkerApprovalMode === 'ABOVE_THRESHOLD') {
    if (!state.coworkerApprovalThreshold.trim()) {
      errors.push('An approval threshold is required when approval mode is "Above threshold".');
    } else if (!isNonNegativeIntString(state.coworkerApprovalThreshold) || Number(state.coworkerApprovalThreshold) < 1) {
      errors.push('Approval threshold must be a whole number of at least 1.');
    } else if (Number(state.coworkerApprovalThreshold) > 2147483647) {
      errors.push('Approval threshold exceeds the int32 maximum (2147483647).');
    }
  } else if (state.coworkerApprovalThreshold.trim() && !isNonNegativeIntString(state.coworkerApprovalThreshold)) {
    errors.push('Approval threshold must be a whole number.');
  }
  return errors;
};

/**
 * Builds the Engine PATCH payload + updateMask entries for changed controls only.
 * Nested messages are merged over the engine's existing values so that a top-level
 * mask entry (which replaces the whole message) does not wipe unrelated subfields.
 */
export const buildControlsUpdate = (
  engine: AppEngine,
  state: EngineControlsState,
): { payload: Partial<AppEngine>; updateMask: string[] } => {
  const baseline = engineToControlsState(engine);
  const payload: Partial<AppEngine> = {};
  const updateMask: string[] = [];

  if (state.releaseChannel !== baseline.releaseChannel) {
    payload.globalFeatureToggleState = state.releaseChannel;
    updateMask.push('globalFeatureToggleState');
  }

  if (
    state.maxUserAgentCount.trim() !== baseline.maxUserAgentCount.trim() ||
    state.maxInstanceAgentCount.trim() !== baseline.maxInstanceAgentCount.trim()
  ) {
    const next: NonNullable<AppEngine['agentCreationConfig']> = {};
    // int64 fields are sent as decimal strings per proto3 JSON mapping.
    if (state.maxUserAgentCount.trim()) next.maxUserAgentCount = state.maxUserAgentCount.trim();
    if (state.maxInstanceAgentCount.trim()) next.maxInstanceAgentCount = state.maxInstanceAgentCount.trim();
    payload.agentCreationConfig = next;
    updateMask.push('agentCreationConfig');
  }

  if (state.digestFrequency !== baseline.digestFrequency) {
    payload.adminEmailNotificationsConfig = {
      ...engine.adminEmailNotificationsConfig,
      digestFrequency: state.digestFrequency,
    };
    updateMask.push('adminEmailNotificationsConfig');
  }

  const principalsChanged =
    parsePrincipals(state.coworkerAllowedPrincipals).join('\n') !==
    parsePrincipals(baseline.coworkerAllowedPrincipals).join('\n');
  const controlChanged =
    state.personalCreationEnabled !== baseline.personalCreationEnabled ||
    state.coworkerCreationEnabled !== baseline.coworkerCreationEnabled ||
    principalsChanged ||
    state.coworkerSharingEnabled !== baseline.coworkerSharingEnabled ||
    state.coworkerGroupSharingEnabled !== baseline.coworkerGroupSharingEnabled ||
    state.coworkerApprovalMode !== baseline.coworkerApprovalMode ||
    state.coworkerApprovalThreshold.trim() !== baseline.coworkerApprovalThreshold.trim();

  if (controlChanged) {
    const existing = engine.agentControlConfig;
    const sharing: NonNullable<NonNullable<EngineAgentControlConfig['coworker']>['sharing']> = {
      ...existing?.coworker?.sharing,
      sharingEnabled: state.coworkerSharingEnabled,
      groupSharingEnabled: state.coworkerGroupSharingEnabled,
      approvalMode: state.coworkerApprovalMode,
    };
    if (state.coworkerApprovalThreshold.trim()) {
      sharing.approvalThresholdUserCount = Number(state.coworkerApprovalThreshold.trim());
    } else {
      delete sharing.approvalThresholdUserCount;
    }
    payload.agentControlConfig = {
      ...existing,
      personal: { ...existing?.personal, creationEnabled: state.personalCreationEnabled },
      coworker: {
        ...existing?.coworker,
        creationEnabled: state.coworkerCreationEnabled,
        allowedPrincipals: parsePrincipals(state.coworkerAllowedPrincipals),
        sharing,
      },
    };
    updateMask.push('agentControlConfig');
  }

  if (
    state.cpiWorkspaceEnterprise !== baseline.cpiWorkspaceEnterprise ||
    state.cpiDataCloud !== baseline.cpiDataCloud
  ) {
    payload.personalizationConfig = {
      ...engine.personalizationConfig,
      crossProductIntelligenceClientEnabledMap: {
        ...engine.personalizationConfig?.crossProductIntelligenceClientEnabledMap,
        [CPI_WORKSPACE_KEY]: state.cpiWorkspaceEnterprise,
        [CPI_DATA_CLOUD_KEY]: state.cpiDataCloud,
      },
    };
    updateMask.push('personalizationConfig');
  }

  return { payload, updateMask };
};
