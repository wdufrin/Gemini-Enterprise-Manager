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

import { describe, it, expect, vi } from 'vitest';
import { AppEngine } from '../../../types';
import {
  POLICY_CAPABLE_FEATURES,
  buildControlsUpdate,
  engineToControlsState,
  parsePolicyMembers,
  validateControlsState,
} from './engineControls';
import { isGoogleInternalEngineField } from '../../../services/api/discovery/engineFieldVisibility';
import {
  getCmekConfig,
  listCmekConfigs,
  sanitizeEngineUpdateForEnrollment,
} from '../../../services/api/discovery/engines';
import * as coreApi from '../../../services/api/core';
import { setCachedProjectEnrollment, clearCachedProjectEnrollment } from '../../../services/api/project';

const baseEngine: AppEngine = {
  name: 'projects/p/locations/global/collections/default_collection/engines/e1',
  displayName: 'E1',
};

describe('engineToControlsState', () => {
  it('applies proto defaults when fields are unset (personal creation on, coworker creation off, policies unset)', () => {
    const s = engineToControlsState(baseEngine);
    expect(s.releaseChannel).toBe('GLOBAL_FEATURE_TOGGLE_STATE_UNSPECIFIED');
    expect(s.personalCreationEnabled).toBe(true);
    expect(s.coworkerCreationEnabled).toBe(false);
    expect(s.maxUserAgentCount).toBe('');
    expect(s.digestFrequency).toBe('DIGEST_FREQUENCY_UNSPECIFIED');
    for (const f of POLICY_CAPABLE_FEATURES) {
      expect(s.featurePolicies[f.key]).toEqual({
        defaultAccess: 'DEFAULT_ACCESS_UNSPECIFIED',
        allowedMembers: '',
        deniedMembers: '',
      });
    }
  });

  it('reads int64 strings, principals, CPI map, and featurePolicies from an existing engine', () => {
    const s = engineToControlsState({
      ...baseEngine,
      agentCreationConfig: { maxUserAgentCount: '5', maxInstanceAgentCount: '100' },
      agentControlConfig: { coworker: { allowedPrincipals: ['user:a@x.com', 'group:g@x.com'] } },
      personalizationConfig: { crossProductIntelligenceClientEnabledMap: { workspace_enterprise: true } },
      featurePolicies: {
        canvas: {
          defaultAccess: 'DENY',
          allowedMembers: [
            { type: 'USER', id: 'alice@example.com' },
            { type: 'GROUP', id: 'designers@example.com' },
          ],
          deniedMembers: [{ type: 'USER', id: 'contractor@example.com' }],
        },
      },
    });
    expect(s.maxUserAgentCount).toBe('5');
    expect(s.maxInstanceAgentCount).toBe('100');
    expect(s.coworkerAllowedPrincipals).toBe('user:a@x.com\ngroup:g@x.com');
    expect(s.cpiWorkspaceEnterprise).toBe(true);
    expect(s.cpiDataCloud).toBe(false);
    expect(s.featurePolicies.canvas).toEqual({
      defaultAccess: 'DENY',
      allowedMembers: 'user:alice@example.com\ngroup:designers@example.com',
      deniedMembers: 'user:contractor@example.com',
    });
  });
});

describe('buildControlsUpdate', () => {
  it('produces an empty mask when nothing changed', () => {
    const { payload, updateMask } = buildControlsUpdate(baseEngine, engineToControlsState(baseEngine));
    expect(updateMask).toEqual([]);
    expect(payload).toEqual({});
  });

  it('only masks the groups that changed and serializes int64 as strings', () => {
    const state = { ...engineToControlsState(baseEngine), releaseChannel: 'EARLY' as const, maxUserAgentCount: ' 10 ' };
    const { payload, updateMask } = buildControlsUpdate(baseEngine, state);
    expect(updateMask).toEqual(['globalFeatureToggleState', 'agentCreationConfig']);
    expect(payload.globalFeatureToggleState).toBe('EARLY');
    expect(payload.agentCreationConfig).toEqual({ maxUserAgentCount: '10' });
  });

  it('merges agentControlConfig over existing values so unknown subfields are preserved', () => {
    const engine: AppEngine = {
      ...baseEngine,
      agentControlConfig: {
        personal: { creationEnabled: true },
        coworker: { creationEnabled: false, sharing: { approvalMode: 'ALWAYS', futureField: 'keep-me' } as never },
      },
    };
    const state = { ...engineToControlsState(engine), coworkerCreationEnabled: true, coworkerAllowedPrincipals: 'user:a@x.com, group:g@x.com' };
    const { payload, updateMask } = buildControlsUpdate(engine, state);
    expect(updateMask).toEqual(['agentControlConfig']);
    expect(payload.agentControlConfig?.coworker?.creationEnabled).toBe(true);
    expect(payload.agentControlConfig?.coworker?.allowedPrincipals).toEqual(['user:a@x.com', 'group:g@x.com']);
    expect((payload.agentControlConfig?.coworker?.sharing as Record<string, unknown>).futureField).toBe('keep-me');
    expect(payload.agentControlConfig?.coworker?.sharing?.approvalMode).toBe('ALWAYS');
  });

  it('merges the CPI map so unrelated client keys are preserved', () => {
    const engine: AppEngine = {
      ...baseEngine,
      personalizationConfig: { crossProductIntelligenceClientEnabledMap: { some_other_client: true } },
    };
    const state = { ...engineToControlsState(engine), cpiDataCloud: true };
    const { payload } = buildControlsUpdate(engine, state);
    expect(payload.personalizationConfig?.crossProductIntelligenceClientEnabledMap).toEqual({
      some_other_client: true,
      workspace_enterprise: false,
      data_cloud: true,
    });
  });

  it('normalizes user:/group: and USER:/GROUP: in featurePolicies, preserves unknown policy keys, and deletes cleared policies', () => {
    const engine: AppEngine = {
      ...baseEngine,
      featurePolicies: {
        skills: { defaultAccess: 'ALLOW', deniedMembers: [{ type: 'USER', id: 'temp@example.com' }] },
        'future-policy-key': { defaultAccess: 'DENY' },
      },
    };
    const baseState = engineToControlsState(engine);
    const nextState = {
      ...baseState,
      featurePolicies: {
        ...baseState.featurePolicies,
        // Clear skills policy completely
        skills: { defaultAccess: 'DEFAULT_ACCESS_UNSPECIFIED' as const, allowedMembers: '', deniedMembers: '' },
        // Configure workflow-agents with mixed-case USER:/group: and duplicate entries
        'workflow-agents': {
          defaultAccess: 'DENY' as const,
          allowedMembers: 'USER:lead@example.com, group:automation@example.com\nuser:lead@example.com',
          deniedMembers: 'GROUP:guests@example.com',
        },
      },
    };

    const { payload, updateMask } = buildControlsUpdate(engine, nextState);
    expect(updateMask).toEqual(['featurePolicies']);
    expect(payload.featurePolicies).toEqual({
      'future-policy-key': { defaultAccess: 'DENY' },
      'workflow-agents': {
        defaultAccess: 'DENY',
        allowedMembers: [
          { type: 'USER', id: 'lead@example.com' },
          { type: 'GROUP', id: 'automation@example.com' },
        ],
        deniedMembers: [{ type: 'GROUP', id: 'guests@example.com' }],
      },
    });
    expect(payload.featurePolicies?.skills).toBeUndefined();
  });
});

describe('validateControlsState — adversarial inputs are rejected', () => {
  const valid = engineToControlsState(baseEngine);

  it('accepts the default state', () => {
    expect(validateControlsState(valid)).toEqual([]);
  });

  it.each(['-1', '1.5', 'abc', '1e3', '10; DROP'])('rejects non-integer agent limit %s', bad => {
    const errors = validateControlsState({ ...valid, maxUserAgentCount: bad });
    expect(errors).toContain('Max agents per user must be a non-negative whole number.');
  });

  it('rejects per-user limit greater than per-engine limit', () => {
    const errors = validateControlsState({ ...valid, maxUserAgentCount: '50', maxInstanceAgentCount: '10' });
    expect(errors).toContain('Max agents per user cannot exceed max agents per engine.');
  });

  it('compares int64 limits beyond Number.MAX_SAFE_INTEGER exactly', () => {
    const errors = validateControlsState({
      ...valid,
      maxUserAgentCount: '9007199254740993',
      maxInstanceAgentCount: '9007199254740992',
    });
    expect(errors).toContain('Max agents per user cannot exceed max agents per engine.');
  });

  it.each(['alice@example.com', 'user:', 'user:a b@x.com', 'admin:root', '*'])('rejects malformed principal %s', bad => {
    const errors = validateControlsState({ ...valid, coworkerAllowedPrincipals: bad });
    expect(errors.some(e => e.startsWith('Invalid coworker principal(s)'))).toBe(true);
  });

  it('accepts well-formed principals including workforce principal URIs', () => {
    const errors = validateControlsState({
      ...valid,
      coworkerAllowedPrincipals:
        'user:a@x.com\ngroup:g@x.com\ndomain:x.com\nprincipal://iam.googleapis.com/locations/global/workforcePools/p/subject/s',
    });
    expect(errors).toEqual([]);
  });

  it('requires a threshold >= 1 when approval mode is ABOVE_THRESHOLD', () => {
    expect(validateControlsState({ ...valid, coworkerApprovalMode: 'ABOVE_THRESHOLD' })).toContain(
      'An approval threshold is required when approval mode is "Above threshold".',
    );
    expect(validateControlsState({ ...valid, coworkerApprovalMode: 'ABOVE_THRESHOLD', coworkerApprovalThreshold: '0' })).toContain(
      'Approval threshold must be a whole number of at least 1.',
    );
    expect(
      validateControlsState({ ...valid, coworkerApprovalMode: 'ABOVE_THRESHOLD', coworkerApprovalThreshold: '2147483648' }),
    ).toContain('Approval threshold exceeds the int32 maximum (2147483647).');
  });

  it.each([
    'alice@example.com',
    'domain:example.com',
    'serviceAccount:bot@proj.iam.gserviceaccount.com',
    'user:',
    'group:',
    'user:not-an-email',
    'user:a b@example.com',
    'user:<script>@example.com',
    '*',
  ])('rejects malformed featurePolicies member entry %s', badMember => {
    const allowedErrors = validateControlsState({
      ...valid,
      featurePolicies: {
        ...valid.featurePolicies,
        canvas: { defaultAccess: 'DENY', allowedMembers: badMember, deniedMembers: '' },
      },
    });
    expect(allowedErrors.some(e => e.includes('Invalid allowed member(s) for canvas'))).toBe(true);

    const deniedErrors = validateControlsState({
      ...valid,
      featurePolicies: {
        ...valid.featurePolicies,
        'no-code-agent-builder': { defaultAccess: 'ALLOW', allowedMembers: '', deniedMembers: badMember },
      },
    });
    expect(deniedErrors.some(e => e.includes('Invalid denied member(s) for no-code-agent-builder'))).toBe(true);
  });

  it('rejects listing the same member in both allowedMembers and deniedMembers (case-insensitive)', () => {
    const errors = validateControlsState({
      ...valid,
      featurePolicies: {
        ...valid.featurePolicies,
        skills: {
          defaultAccess: 'ALLOW',
          allowedMembers: 'USER:Alice@Example.com',
          deniedMembers: 'user:alice@example.com',
        },
      },
    });
    expect(errors.some(e => e.includes('cannot list the same member in both allowed and denied lists'))).toBe(true);
  });

  it('accepts valid user:/group: and USER:/GROUP: entries in parsePolicyMembers and validateControlsState', () => {
    const parsed = parsePolicyMembers('USER:alice@example.com, group:eng@example.com');
    expect(parsed).toEqual([
      { type: 'USER', id: 'alice@example.com' },
      { type: 'GROUP', id: 'eng@example.com' },
    ]);
    const errors = validateControlsState({
      ...valid,
      featurePolicies: {
        ...valid.featurePolicies,
        canvas: {
          defaultAccess: 'DENY',
          allowedMembers: 'USER:alice@example.com\ngroup:eng@example.com',
          deniedMembers: 'user:contractor@example.com',
        },
      },
    });
    expect(errors).toEqual([]);
  });
});

describe('GOOGLE_INTERNAL field handling (v1main/engine.proto alignment)', () => {
  it('classifies GOOGLE_INTERNAL vs newly PUBLIC fields accurately across camelCase, snake_case, and dotted paths', () => {
    // GOOGLE_INTERNAL fields
    expect(isGoogleInternalEngineField('agentControlConfig')).toBe(true);
    expect(isGoogleInternalEngineField('agent_control_config')).toBe(true);
    expect(isGoogleInternalEngineField('agentControlConfig.coworker')).toBe(true);
    expect(isGoogleInternalEngineField('mobileNotificationPolicy')).toBe(true);
    expect(isGoogleInternalEngineField('mobile_notification_policy')).toBe(true);
    expect(isGoogleInternalEngineField('essSettingsVersion')).toBe(true);
    expect(isGoogleInternalEngineField('featureExceptions')).toBe(true);
    expect(isGoogleInternalEngineField('importedTools')).toBe(true);
    expect(isGoogleInternalEngineField('agentspaceConfig')).toBe(true);
    expect(isGoogleInternalEngineField('kmsKeyName')).toBe(true);
    expect(isGoogleInternalEngineField('driveDataConnectors')).toBe(true);
    expect(isGoogleInternalEngineField('drive_data_connectors')).toBe(true);

    // PUBLIC fields (including promoted globalFeatureToggleState and effectiveFeatures)
    expect(isGoogleInternalEngineField('globalFeatureToggleState')).toBe(false);
    expect(isGoogleInternalEngineField('global_feature_toggle_state')).toBe(false);
    expect(isGoogleInternalEngineField('effectiveFeatures')).toBe(false);
    expect(isGoogleInternalEngineField('effective_features')).toBe(false);
    expect(isGoogleInternalEngineField('featurePolicies')).toBe(false);
    expect(isGoogleInternalEngineField('procurementContactEmails')).toBe(false);
    expect(isGoogleInternalEngineField('agentGatewaySetting')).toBe(false);
    expect(isGoogleInternalEngineField('displayName')).toBe(false);
    expect(isGoogleInternalEngineField('features')).toBe(false);
  });

  it('sanitizer strips GOOGLE_INTERNAL fields for a non-enrolled project while preserving public fields like globalFeatureToggleState and featurePolicies', () => {
    clearCachedProjectEnrollment();
    setCachedProjectEnrollment({
      projectId: 'ext-proj',
      checkedAt: new Date().toISOString(),
      googleInternal: false,
      trustedTester: false,
      notebookLmApiUser: false,
      agentRegistryEnabled: false,
      categories: [],
    });
    const { sanitizedPayload, sanitizedMask } = sanitizeEngineUpdateForEnrollment(
      {
        displayName: 'x',
        globalFeatureToggleState: 'EARLY',
        featurePolicies: { canvas: { defaultAccess: 'ALLOW' } },
        agentCreationConfig: {},
        agentControlConfig: {},
        adminEmailNotificationsConfig: {},
        personalizationConfig: {},
        mobileNotificationPolicy: 'OFF',
        kmsKeyName: 'projects/p/locations/l/keyRings/r/cryptoKeys/k',
      },
      [
        'displayName',
        'globalFeatureToggleState',
        'featurePolicies',
        'agentCreationConfig',
        'agentControlConfig',
        'adminEmailNotificationsConfig',
        'personalizationConfig',
        'mobileNotificationPolicy',
        'kmsKeyName',
      ],
      'ext-proj',
    );
    expect(sanitizedMask).toEqual(['displayName', 'globalFeatureToggleState', 'featurePolicies']);
    expect(Object.keys(sanitizedPayload)).toEqual(['displayName', 'globalFeatureToggleState', 'featurePolicies']);
    clearCachedProjectEnrollment();
  });
});

describe('CMEK Discovery Engine helpers (getCmekConfig & listCmekConfigs)', () => {
  it('constructs regional and global v1 URLs for singleton cmekConfig, named cmekConfigs, and listCmekConfigs', async () => {
    const spy = vi.spyOn(coreApi, 'gapiRequest').mockResolvedValue({ state: 'ACTIVE' } as never);
    const euConfig = { projectId: 'proj-1', appLocation: 'eu', collectionId: 'default_collection', appId: '' };

    await getCmekConfig(euConfig);
    expect(spy).toHaveBeenCalledWith(
      'https://eu-discoveryengine.googleapis.com/v1/projects/proj-1/locations/eu/cmekConfig',
      'GET',
      'proj-1',
      undefined,
      undefined,
      undefined,
      undefined,
    );

    await getCmekConfig(euConfig, 'custom-key-cfg');
    expect(spy).toHaveBeenCalledWith(
      'https://eu-discoveryengine.googleapis.com/v1/projects/proj-1/locations/eu/cmekConfigs/custom-key-cfg',
      'GET',
      'proj-1',
      undefined,
      undefined,
      undefined,
      undefined,
    );

    await listCmekConfigs(euConfig);
    expect(spy).toHaveBeenCalledWith(
      'https://eu-discoveryengine.googleapis.com/v1/projects/proj-1/locations/eu/cmekConfigs',
      'GET',
      'proj-1',
      undefined,
      undefined,
      undefined,
      true,
    );

    spy.mockRestore();
  });
});
