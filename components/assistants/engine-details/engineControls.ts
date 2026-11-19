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
  EngineFeaturePolicy,
  EngineFeaturePolicyMember,
  EngineGlobalFeatureToggleState,
} from '../../../types';

export const POLICY_CAPABLE_FEATURES = [
  {
    key: 'no-code-agent-builder',
    label: 'No-Code Agent Designer',
    description: 'Per-user and per-group access policy for No-Code Agent Designer.',
  },
  {
    key: 'canvas',
    label: 'Canvas Side-by-Side Editor',
    description: 'Per-user and per-group access policy for Canvas.',
  },
  {
    key: 'skills',
    label: 'Specialized Skills Engine',
    description: 'Per-user and per-group access policy for Skills.',
  },
  {
    key: 'workflow-agents',
    label: 'Autonomous Workflow Agents',
    description: 'Per-user and per-group access policy for Workflow Agents.',
  },
] as const;

export type PolicyCapableFeatureKey = (typeof POLICY_CAPABLE_FEATURES)[number]['key'];
export type FeaturePolicyDefaultAccess = 'DEFAULT_ACCESS_UNSPECIFIED' | 'ALLOW' | 'DENY';

export interface FeaturePolicyFormEntry {
  defaultAccess: FeaturePolicyDefaultAccess;
  /** Newline or comma-separated `user:alice@example.com` or `group:team@example.com` entries. */
  allowedMembers: string;
  deniedMembers: string;
}

export const FEATURE_POLICY_DEFAULT_ACCESS_OPTIONS: { value: FeaturePolicyDefaultAccess; label: string }[] = [
  { value: 'DEFAULT_ACCESS_UNSPECIFIED', label: 'Unset (inherit feature toggle)' },
  { value: 'ALLOW', label: 'Allow by default (deny listed exceptions)' },
  { value: 'DENY', label: 'Deny by default (allow listed exceptions)' },
];

/**
 * Form state for top-level Engine governance controls
 * (engine.proto: globalFeatureToggleState, featurePolicies, agentCreationConfig,
 * agentControlConfig, adminEmailNotificationsConfig, personalizationConfig).
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
  featurePolicies: Record<PolicyCapableFeatureKey, FeaturePolicyFormEntry>;
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

/** Accepted user:/group: member entry for Engine.featurePolicies (case-insensitive prefix, normalized to USER/GROUP). */
const POLICY_MEMBER_PATTERN = /^(user|group):([^\s@:;<>,"']+@[^\s@:;<>,"']+\.[^\s@:;<>,"']+)$/i;

const parsePrincipals = (raw: string): string[] =>
  raw
    .split(/[\n,]/)
    .map(p => p.trim())
    .filter(Boolean);

const splitMemberTokens = (raw: string): string[] =>
  raw
    .split(/[\n,]/)
    .map(s => s.trim())
    .filter(Boolean);

export const parsePolicyMemberToken = (rawToken: string): EngineFeaturePolicyMember | null => {
  const match = rawToken.trim().match(POLICY_MEMBER_PATTERN);
  if (!match) return null;
  return {
    type: match[1].toUpperCase() as 'USER' | 'GROUP',
    id: match[2],
  };
};

export const parsePolicyMembers = (raw: string): EngineFeaturePolicyMember[] => {
  const seen = new Set<string>();
  const result: EngineFeaturePolicyMember[] = [];
  for (const token of splitMemberTokens(raw)) {
    const parsed = parsePolicyMemberToken(token);
    if (parsed) {
      const canonicalKey = `${parsed.type}:${parsed.id.toLowerCase()}`;
      if (!seen.has(canonicalKey)) {
        seen.add(canonicalKey);
        result.push(parsed);
      }
    }
  }
  return result;
};

const formatPolicyMembers = (members?: EngineFeaturePolicyMember[]): string =>
  (members || [])
    .filter(m => Boolean(m && m.id))
    .map(m => `${(m.type || 'USER').toLowerCase()}:${m.id}`)
    .join('\n');

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

  const featurePolicies = {} as Record<PolicyCapableFeatureKey, FeaturePolicyFormEntry>;
  for (const f of POLICY_CAPABLE_FEATURES) {
    const existing = engine.featurePolicies?.[f.key];
    const defaultAccess: FeaturePolicyDefaultAccess =
      existing?.defaultAccess === 'ALLOW' || existing?.defaultAccess === 'DENY'
        ? existing.defaultAccess
        : 'DEFAULT_ACCESS_UNSPECIFIED';
    featurePolicies[f.key] = {
      defaultAccess,
      allowedMembers: formatPolicyMembers(existing?.allowedMembers),
      deniedMembers: formatPolicyMembers(existing?.deniedMembers),
    };
  }

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
    featurePolicies,
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

  for (const f of POLICY_CAPABLE_FEATURES) {
    const entry = state.featurePolicies?.[f.key];
    if (!entry) continue;
    const invalidAllowed = splitMemberTokens(entry.allowedMembers).filter(t => !parsePolicyMemberToken(t));
    if (invalidAllowed.length > 0) {
      errors.push(
        `Invalid allowed member(s) for ${f.key}: ${invalidAllowed.join(', ')}. Use user:email@domain.com or group:team@domain.com.`,
      );
    }
    const invalidDenied = splitMemberTokens(entry.deniedMembers).filter(t => !parsePolicyMemberToken(t));
    if (invalidDenied.length > 0) {
      errors.push(
        `Invalid denied member(s) for ${f.key}: ${invalidDenied.join(', ')}. Use user:email@domain.com or group:team@domain.com.`,
      );
    }
    const allowedParsed = parsePolicyMembers(entry.allowedMembers);
    const deniedSet = new Set(
      parsePolicyMembers(entry.deniedMembers).map(m => `${m.type}:${m.id.toLowerCase()}`),
    );
    const overlapping = allowedParsed.filter(m => deniedSet.has(`${m.type}:${m.id.toLowerCase()}`));
    if (overlapping.length > 0) {
      errors.push(
        `Feature policy for ${f.key} cannot list the same member in both allowed and denied lists: ${overlapping.map(m => `${m.type.toLowerCase()}:${m.id}`).join(', ')}.`,
      );
    }
  }

  return errors;
};

const serializePolicyCanonical = (entry?: FeaturePolicyFormEntry): string => {
  if (!entry) return 'DEFAULT_ACCESS_UNSPECIFIED||';
  const def = entry.defaultAccess || 'DEFAULT_ACCESS_UNSPECIFIED';
  const allowed = parsePolicyMembers(entry.allowedMembers)
    .map(m => `${m.type}:${m.id}`)
    .join(',');
  const denied = parsePolicyMembers(entry.deniedMembers)
    .map(m => `${m.type}:${m.id}`)
    .join(',');
  return `${def}|${allowed}|${denied}`;
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

  const featurePoliciesChanged = POLICY_CAPABLE_FEATURES.some(
    f =>
      serializePolicyCanonical(state.featurePolicies?.[f.key]) !==
      serializePolicyCanonical(baseline.featurePolicies?.[f.key]),
  );

  if (featurePoliciesChanged) {
    const nextPolicies: Record<string, EngineFeaturePolicy> = { ...(engine.featurePolicies || {}) };
    for (const f of POLICY_CAPABLE_FEATURES) {
      const entry = state.featurePolicies?.[f.key];
      const defaultAccess = entry?.defaultAccess || 'DEFAULT_ACCESS_UNSPECIFIED';
      const allowed = parsePolicyMembers(entry?.allowedMembers || '');
      const denied = parsePolicyMembers(entry?.deniedMembers || '');

      if (defaultAccess === 'DEFAULT_ACCESS_UNSPECIFIED' && allowed.length === 0 && denied.length === 0) {
        delete nextPolicies[f.key];
      } else {
        const nextEntry: EngineFeaturePolicy = {};
        if (defaultAccess !== 'DEFAULT_ACCESS_UNSPECIFIED') {
          nextEntry.defaultAccess = defaultAccess;
        }
        if (allowed.length > 0) {
          nextEntry.allowedMembers = allowed;
        }
        if (denied.length > 0) {
          nextEntry.deniedMembers = denied;
        }
        nextPolicies[f.key] = nextEntry;
      }
    }
    payload.featurePolicies = nextPolicies;
    updateMask.push('featurePolicies');
  }

  return { payload, updateMask };
};
