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

import { describe, it, expect } from 'vitest';
import { AppEngine } from '../../../types';
import { buildControlsUpdate, engineToControlsState, validateControlsState } from './engineControls';
import { isGoogleInternalEngineField } from '../../../services/api/discovery/engineFieldVisibility';
import { sanitizeEngineUpdateForEnrollment } from '../../../services/api/discovery/engines';
import { setCachedProjectEnrollment, clearCachedProjectEnrollment } from '../../../services/api/project';

const baseEngine: AppEngine = {
  name: 'projects/p/locations/global/collections/default_collection/engines/e1',
  displayName: 'E1',
};

describe('engineToControlsState', () => {
  it('applies proto defaults when fields are unset (personal creation on, coworker creation off)', () => {
    const s = engineToControlsState(baseEngine);
    expect(s.releaseChannel).toBe('GLOBAL_FEATURE_TOGGLE_STATE_UNSPECIFIED');
    expect(s.personalCreationEnabled).toBe(true);
    expect(s.coworkerCreationEnabled).toBe(false);
    expect(s.maxUserAgentCount).toBe('');
    expect(s.digestFrequency).toBe('DIGEST_FREQUENCY_UNSPECIFIED');
  });

  it('reads int64 strings, principals, and CPI map from an existing engine', () => {
    const s = engineToControlsState({
      ...baseEngine,
      agentCreationConfig: { maxUserAgentCount: '5', maxInstanceAgentCount: '100' },
      agentControlConfig: { coworker: { allowedPrincipals: ['user:a@x.com', 'group:g@x.com'] } },
      personalizationConfig: { crossProductIntelligenceClientEnabledMap: { workspace_enterprise: true } },
    });
    expect(s.maxUserAgentCount).toBe('5');
    expect(s.maxInstanceAgentCount).toBe('100');
    expect(s.coworkerAllowedPrincipals).toBe('user:a@x.com\ngroup:g@x.com');
    expect(s.cpiWorkspaceEnterprise).toBe(true);
    expect(s.cpiDataCloud).toBe(false);
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
});

describe('GOOGLE_INTERNAL field handling', () => {
  it('classifies camelCase, snake_case, and dotted mask paths', () => {
    expect(isGoogleInternalEngineField('agentControlConfig')).toBe(true);
    expect(isGoogleInternalEngineField('agent_control_config')).toBe(true);
    expect(isGoogleInternalEngineField('agentControlConfig.coworker')).toBe(true);
    expect(isGoogleInternalEngineField('global_feature_toggle_state')).toBe(true);
    expect(isGoogleInternalEngineField('displayName')).toBe(false);
    expect(isGoogleInternalEngineField('features')).toBe(false);
  });

  it('sanitizer strips all five new controls for a known non-enrolled project but keeps public fields', () => {
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
        agentCreationConfig: {},
        agentControlConfig: {},
        adminEmailNotificationsConfig: {},
        personalizationConfig: {},
      },
      ['displayName', 'globalFeatureToggleState', 'agentCreationConfig', 'agentControlConfig', 'adminEmailNotificationsConfig', 'personalizationConfig'],
      'ext-proj',
    );
    expect(sanitizedMask).toEqual(['displayName']);
    expect(Object.keys(sanitizedPayload)).toEqual(['displayName']);
    clearCachedProjectEnrollment();
  });
});
