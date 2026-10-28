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
    RELEASE_CHANNEL_OPTIONS,
} from './engineControls';
import { EngineAgentApprovalMode, EngineDigestFrequency, EngineGlobalFeatureToggleState } from '../../../types';

interface AdvancedEngineControlsSectionProps {
    controls: EngineControlsState;
    errors: string[];
    /** true = enrolled, false = known NOT enrolled, null = enrollment not probed yet. */
    googleInternalEnrollment: boolean | null;
    onChange: <K extends keyof EngineControlsState>(field: K, value: EngineControlsState[K]) => void;
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
}) => {
    const disabled = googleInternalEnrollment === false;

    const checkbox = (field: keyof EngineControlsState, label: string, tooltip: string) => (
        <label className="flex items-center gap-2 text-xs text-gray-300">
            <input
                type="checkbox"
                aria-label={label}
                checked={Boolean(controls[field])}
                disabled={disabled}
                onChange={e => onChange(field, e.target.checked as EngineControlsState[typeof field])}
                className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            {label}
            <InfoTooltip text={tooltip} />
        </label>
    );

    return (
        <CollapsibleSection title="Advanced Engine Controls (Google Internal)">
            <div className="space-y-4 p-4 bg-gray-900/40 rounded-md border border-gray-700/80">
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
                        'This project is not enrolled in GOOGLE_INTERNAL visibility. These top-level Engine fields are read-only here and cannot be saved.'}
                    {googleInternalEnrollment === true &&
                        'Project verified for GOOGLE_INTERNAL visibility. Only controls you change are sent in the update mask.'}
                    {googleInternalEnrollment === null &&
                        'GOOGLE_INTERNAL enrollment has not been probed for this project. Saves are attempted as-is; if the API rejects a field, the error is shown below and nothing is reported as saved.'}
                </div>

                {/* Release channel */}
                <div className={groupClass}>
                    <label htmlFor="releaseChannel" className={labelClass}>
                        Release Channel
                        <InfoTooltip text="engine.globalFeatureToggleState. Controls when new features and models turn on by default when they are not explicitly set in Feature Management." />
                    </label>
                    <select
                        id="releaseChannel"
                        value={controls.releaseChannel}
                        disabled={disabled}
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

                {/* Agent creation quotas */}
                <div className={groupClass}>
                    <span className={labelClass}>
                        Agent Creation Limits
                        <InfoTooltip text="engine.agentCreationConfig. Leave blank to leave the limit unset (backend default)." />
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="maxUserAgentCount" className="text-[11px] text-gray-400">Max agents per user</label>
                            <input
                                id="maxUserAgentCount"
                                inputMode="numeric"
                                placeholder="Unset"
                                value={controls.maxUserAgentCount}
                                disabled={disabled}
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
                                disabled={disabled}
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
                        <InfoTooltip text="engine.agentControlConfig. Personal agents default to enabled; coworker (long-running) agents default to disabled." />
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
                            disabled={disabled}
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
                                disabled={disabled}
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
                                disabled={disabled}
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
                        <InfoTooltip text="engine.adminEmailNotificationsConfig.digestFrequency. How often admins receive a digest of pending agent/skill share requests." />
                    </label>
                    <select
                        id="digestFrequency"
                        value={controls.digestFrequency}
                        disabled={disabled}
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
                        <InfoTooltip text="engine.personalizationConfig.crossProductIntelligenceClientEnabledMap. Unset keys are shown as off. Takes effect only when the Cross-Product Workspace Intelligence feature is on." />
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
