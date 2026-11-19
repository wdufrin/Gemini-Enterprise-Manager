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
import CollapsibleSection from './CollapsibleSection';
import InfoTooltip from '../../InfoTooltip';
import {
    APPROVAL_MODE_OPTIONS,
    DIGEST_FREQUENCY_OPTIONS,
    EngineControlsState,
    FEATURE_POLICY_DEFAULT_ACCESS_OPTIONS,
    FeaturePolicyDefaultAccess,
    FeaturePolicyFormEntry,
    POLICY_CAPABLE_FEATURES,
    PolicyCapableFeatureKey,
    RELEASE_CHANNEL_OPTIONS,
} from './engineControls';
import { EngineAgentApprovalMode, EngineDigestFrequency, EngineGlobalFeatureToggleState } from '../../../types';

interface AdvancedEngineControlsSectionProps {
    controls: EngineControlsState;
    errors: string[];
    /** true = enrolled, false = known NOT enrolled, null = enrollment not probed yet. */
    googleInternalEnrollment: boolean | null;
    onChange: <K extends keyof EngineControlsState>(field: K, value: EngineControlsState[K]) => void;
    onFeaturePolicyChange?: (featureKey: PolicyCapableFeatureKey, patch: Partial<FeaturePolicyFormEntry>) => void;
}

const inputClass =
    'w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:ring-1 focus:ring-blue-500 outline-none disabled:opacity-50';
const labelClass = 'flex items-center text-xs font-semibold text-gray-300 mb-1';
const groupClass = 'p-3 rounded-lg border border-gray-800 bg-gray-900/60 space-y-3';

export const AdvancedEngineControlsSection: React.FC<AdvancedEngineControlsSectionProps> = ({
    controls,
    errors,
    googleInternalEnrollment,
    onChange,
    onFeaturePolicyChange,
}) => {
    const internalDisabled = googleInternalEnrollment === false;

    const updatePolicy = (featureKey: PolicyCapableFeatureKey, patch: Partial<FeaturePolicyFormEntry>) => {
        if (onFeaturePolicyChange) {
            onFeaturePolicyChange(featureKey, patch);
            return;
        }
        onChange('featurePolicies', {
            ...controls.featurePolicies,
            [featureKey]: {
                ...controls.featurePolicies[featureKey],
                ...patch,
            },
        });
    };

    const checkbox = (field: keyof EngineControlsState, label: string, tooltip: string) => (
        <label className="flex items-center gap-2 text-xs text-gray-300">
            <input
                type="checkbox"
                aria-label={label}
                checked={Boolean(controls[field])}
                disabled={internalDisabled}
                onChange={e => onChange(field, e.target.checked as EngineControlsState[typeof field])}
                className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            {label}
            <InfoTooltip text={tooltip} />
        </label>
    );

    return (
        <CollapsibleSection title="Advanced Engine &amp; Governance Controls">
            <div className="space-y-4 p-4 bg-gray-900/40 rounded-md border border-gray-700/80">
                {/* Release channel (PUBLIC in v1main/engine.proto) */}
                <div className={groupClass}>
                    <div className="flex items-center justify-between gap-2">
                        <label htmlFor="releaseChannel" className={labelClass}>
                            Release Channel
                            <InfoTooltip text="engine.globalFeatureToggleState (Public). Controls when new features and models turn on by default when they are not explicitly set in Feature Management." />
                        </label>
                        <span className="inline-block text-[9px] px-1.5 py-0.2 bg-emerald-950/70 text-emerald-400 border border-emerald-800/50 rounded font-bold">
                            Public API
                        </span>
                    </div>
                    <select
                        id="releaseChannel"
                        value={controls.releaseChannel}
                        onChange={e => onChange('releaseChannel', e.target.value as EngineGlobalFeatureToggleState)}
                        className={inputClass}
                    >
                        {RELEASE_CHANNEL_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                    <p className="text-[11px] text-gray-500">
                        {RELEASE_CHANNEL_OPTIONS.find(o => o.value === controls.releaseChannel)?.description}
                    </p>
                </div>

                {/* Per-Feature RBAC Policies (Engine.featurePolicies - Public) */}
                <div className={groupClass}>
                    <div className="flex items-center justify-between gap-2">
                        <span className={labelClass}>
                            Per-Feature Access Policies (RBAC)
                            <InfoTooltip text="engine.featurePolicies. Configures fine-grained per-user and per-group ALLOW/DENY rules for policy-capable features (no-code-agent-builder, canvas, skills, workflow-agents). Entries are normalized to { type: 'USER' | 'GROUP', id }." />
                        </span>
                        <span className="inline-block text-[9px] px-1.5 py-0.2 bg-emerald-950/70 text-emerald-400 border border-emerald-800/50 rounded font-bold">
                            Public RBAC
                        </span>
                    </div>
                    <p className="text-[11px] text-gray-400">
                        Restrict or grant specific features by user or group email (`user:alice@example.com`, `group:eng@example.com`). Leave Default Access unset and member lists empty to inherit the engine-wide feature toggle.
                    </p>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {POLICY_CAPABLE_FEATURES.map(feature => {
                            const entry = controls.featurePolicies?.[feature.key] || {
                                defaultAccess: 'DEFAULT_ACCESS_UNSPECIFIED' as FeaturePolicyDefaultAccess,
                                allowedMembers: '',
                                deniedMembers: '',
                            };
                            return (
                                <div key={feature.key} className="p-3 rounded-md bg-gray-950/70 border border-gray-800 space-y-2.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <div>
                                            <div className="text-xs font-bold text-gray-200">{feature.label}</div>
                                            <div className="text-[10px] font-mono text-gray-500">{feature.key}</div>
                                        </div>
                                        {entry.defaultAccess !== 'DEFAULT_ACCESS_UNSPECIFIED' && (
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold border ${
                                                entry.defaultAccess === 'ALLOW'
                                                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                                                    : 'bg-rose-950/60 text-rose-300 border-rose-800/60'
                                            }`}>
                                                {entry.defaultAccess}
                                            </span>
                                        )}
                                    </div>
                                    <div>
                                        <label htmlFor={`policy-default-${feature.key}`} className="text-[11px] text-gray-400 block mb-1">
                                            Default Access
                                        </label>
                                        <select
                                            id={`policy-default-${feature.key}`}
                                            value={entry.defaultAccess}
                                            onChange={e =>
                                                updatePolicy(feature.key, {
                                                    defaultAccess: e.target.value as FeaturePolicyDefaultAccess,
                                                })
                                            }
                                            className={inputClass}
                                        >
                                            {FEATURE_POLICY_DEFAULT_ACCESS_OPTIONS.map(opt => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label htmlFor={`policy-allow-${feature.key}`} className="text-[11px] text-gray-400 block mb-1">
                                            Allowed Members (`user:...` / `group:...`)
                                        </label>
                                        <textarea
                                            id={`policy-allow-${feature.key}`}
                                            rows={2}
                                            placeholder={'user:alice@example.com\ngroup:builders@example.com'}
                                            value={entry.allowedMembers}
                                            onChange={e => updatePolicy(feature.key, { allowedMembers: e.target.value })}
                                            className={`${inputClass} font-mono`}
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor={`policy-deny-${feature.key}`} className="text-[11px] text-gray-400 block mb-1">
                                            Denied Members (`user:...` / `group:...`)
                                        </label>
                                        <textarea
                                            id={`policy-deny-${feature.key}`}
                                            rows={2}
                                            placeholder={'user:contractor@example.com\ngroup:external@example.com'}
                                            value={entry.deniedMembers}
                                            onChange={e => updatePolicy(feature.key, { deniedMembers: e.target.value })}
                                            className={`${inputClass} font-mono`}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* GOOGLE_INTERNAL enrollment banner for internal-only controls below */}
                <div
                    className={`text-xs rounded-md p-3 border ${
                        googleInternalEnrollment === false
                            ? 'bg-red-950/50 border-red-800/60 text-red-300'
                            : googleInternalEnrollment === true
                            ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
                            : 'bg-amber-950/40 border-amber-800/50 text-amber-300'
                    }`}
                >
                    {googleInternalEnrollment === false &&
                        'This project is not enrolled in GOOGLE_INTERNAL visibility. Internal-only Engine fields below are read-only and cannot be saved (Release Channel and Per-Feature RBAC above remain editable).'}
                    {googleInternalEnrollment === true &&
                        'Project verified for GOOGLE_INTERNAL visibility. Only controls you change are sent in the update mask.'}
                    {googleInternalEnrollment === null &&
                        'GOOGLE_INTERNAL enrollment has not been probed for this project. Saves are attempted as-is; if the API rejects a field, the error is shown below and nothing is reported as saved.'}
                </div>

                {/* Agent creation quotas */}
                <div className={groupClass}>
                    <span className={labelClass}>
                        Agent Creation Limits
                        <InfoTooltip text="engine.agentCreationConfig (GOOGLE_INTERNAL). Leave blank to leave the limit unset (backend default)." />
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="maxUserAgentCount" className="text-[11px] text-gray-400">Max agents per user</label>
                            <input
                                id="maxUserAgentCount"
                                inputMode="numeric"
                                placeholder="Unset"
                                value={controls.maxUserAgentCount}
                                disabled={internalDisabled}
                                onChange={e => onChange('maxUserAgentCount', e.target.value)}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label htmlFor="maxInstanceAgentCount" className="text-[11px] text-gray-400">Max agents per engine (all users)</label>
                            <input
                                id="maxInstanceAgentCount"
                                inputMode="numeric"
                                placeholder="Unset"
                                value={controls.maxInstanceAgentCount}
                                disabled={internalDisabled}
                                onChange={e => onChange('maxInstanceAgentCount', e.target.value)}
                                className={inputClass}
                            />
                        </div>
                    </div>
                </div>

                {/* Personal & Coworker agent controls */}
                <div className={groupClass}>
                    <span className={labelClass}>
                        Personal &amp; Coworker Agent Controls
                        <InfoTooltip text="engine.agentControlConfig (GOOGLE_INTERNAL). Personal agents default to enabled; coworker (long-running) agents default to disabled." />
                    </span>
                    {checkbox('personalCreationEnabled', 'Users can create personal agents', 'agentControlConfig.personal.creationEnabled')}
                    {checkbox('coworkerCreationEnabled', 'Users can create coworker agents', 'agentControlConfig.coworker.creationEnabled')}
                    <div>
                        <label htmlFor="coworkerAllowedPrincipals" className="text-[11px] text-gray-400">
                            Allowed coworker creators (one per line)
                        </label>
                        <textarea
                            id="coworkerAllowedPrincipals"
                            rows={3}
                            placeholder={'user:alice@example.com\ngroup:admins@example.com'}
                            value={controls.coworkerAllowedPrincipals}
                            disabled={internalDisabled}
                            onChange={e => onChange('coworkerAllowedPrincipals', e.target.value)}
                            className={`${inputClass} font-mono`}
                        />
                    </div>
                    {checkbox('coworkerSharingEnabled', 'Coworker agent sharing', 'agentControlConfig.coworker.sharing.sharingEnabled')}
                    {checkbox('coworkerGroupSharingEnabled', 'Coworker agent sharing with groups', 'agentControlConfig.coworker.sharing.groupSharingEnabled')}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="coworkerApprovalMode" className="text-[11px] text-gray-400">Share approval mode</label>
                            <select
                                id="coworkerApprovalMode"
                                value={controls.coworkerApprovalMode}
                                disabled={internalDisabled}
                                onChange={e => onChange('coworkerApprovalMode', e.target.value as EngineAgentApprovalMode)}
                                className={inputClass}
                            >
                                {APPROVAL_MODE_OPTIONS.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="coworkerApprovalThreshold" className="text-[11px] text-gray-400">Approval threshold (user count)</label>
                            <input
                                id="coworkerApprovalThreshold"
                                inputMode="numeric"
                                placeholder={controls.coworkerApprovalMode === 'ABOVE_THRESHOLD' ? 'Required' : 'Unset'}
                                value={controls.coworkerApprovalThreshold}
                                disabled={internalDisabled}
                                onChange={e => onChange('coworkerApprovalThreshold', e.target.value)}
                                className={inputClass}
                            />
                        </div>
                    </div>
                </div>

                {/* Admin email digest */}
                <div className={groupClass}>
                    <label htmlFor="digestFrequency" className={labelClass}>
                        Admin Approval Digest Email
                        <InfoTooltip text="engine.adminEmailNotificationsConfig.digestFrequency (GOOGLE_INTERNAL). How often admins receive a digest of pending agent/skill share requests." />
                    </label>
                    <select
                        id="digestFrequency"
                        value={controls.digestFrequency}
                        disabled={internalDisabled}
                        onChange={e => onChange('digestFrequency', e.target.value as EngineDigestFrequency)}
                        className={inputClass}
                    >
                        {DIGEST_FREQUENCY_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </div>

                {/* Cross-product intelligence */}
                <div className={groupClass}>
                    <span className={labelClass}>
                        Cross-Product Intelligence Sources
                        <InfoTooltip text="engine.personalizationConfig.crossProductIntelligenceClientEnabledMap (GOOGLE_INTERNAL). Unset keys are shown as off. Takes effect only when the Cross-Product Workspace Intelligence feature is on." />
                    </span>
                    {checkbox('cpiWorkspaceEnterprise', 'Google Workspace Enterprise', "Map key 'workspace_enterprise'")}
                    {checkbox('cpiDataCloud', 'Data Cloud', "Map key 'data_cloud'")}
                </div>

                {errors.length > 0 && (
                    <ul role="alert" className="text-xs text-red-400 list-disc pl-5 space-y-0.5">
                        {errors.map(err => <li key={err}>{err}</li>)}
                    </ul>
                )}
            </div>
        </CollapsibleSection>
    );
};

export default AdvancedEngineControlsSection;
