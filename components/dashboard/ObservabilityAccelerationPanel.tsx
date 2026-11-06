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

import React, { useState } from 'react';
import {
    ACCELERATION_TABLE_ID,
    ACCELERATION_BACKFILL_DAYS,
    ACCELERATION_PARTITION_EXPIRATION_DAYS,
} from '../../services/observabilityAcceleration';

export type AccelerationBusyState = 'enabling' | 'refreshing' | 'disabling' | null;

interface Props {
    enabled: boolean;
    watermark: Date | null;
    busy: AccelerationBusyState;
    error: string | null;
    lastInsertedRows: number | null;
    onEnable: () => void;
    onRefresh: () => void;
    onDisable: () => void;
}

const formatUtc = (d: Date) => `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;

export const ObservabilityAccelerationPanel: React.FC<Props> = ({
    enabled,
    watermark,
    busy,
    error,
    lastInsertedRows,
    onEnable,
    onRefresh,
    onDisable,
}) => {
    const [confirmDisable, setConfirmDisable] = useState(false);
    const isBusy = busy !== null;

    return (
        <div
            data-testid="acceleration-panel"
            className="mb-4 p-3 rounded-lg border border-gray-700 bg-gray-900/60 text-xs text-gray-300 flex flex-wrap items-center justify-between gap-3"
        >
            <div className="space-y-0.5 max-w-3xl">
                <div className="font-semibold text-gray-200 flex items-center gap-2">
                    High-Scale Acceleration
                    <span
                        data-testid="acceleration-status-badge"
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                            enabled
                                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                                : 'bg-gray-800 text-gray-400 border-gray-700'
                        }`}
                    >
                        {enabled ? 'ON' : 'OFF'}
                    </span>
                </div>
                {enabled ? (
                    <p data-testid="acceleration-freshness">
                        {watermark
                            ? `Accelerated through ${formatUtc(watermark)}. Newer events are read from raw logs, so charts stay current; press Refresh to move more history into the fast table.`
                            : `Acceleration table is empty (no user activity in the last ${ACCELERATION_BACKFILL_DAYS} days at last refresh). Charts read raw logs.`}
                    </p>
                ) : (
                    <p>
                        For large tenants: creates <code className="font-mono text-amber-300">{ACCELERATION_TABLE_ID}</code>, a small
                        table of pre-extracted activity fields, so charts stop re-parsing raw log JSON on every load. Setup reads
                        the last {ACCELERATION_BACKFILL_DAYS} days of raw logs once. Refresh is manual. Data older than{' '}
                        {ACCELERATION_PARTITION_EXPIRATION_DAYS} days is deleted automatically.
                    </p>
                )}
                {lastInsertedRows !== null && !error && (
                    <p data-testid="acceleration-last-result" className="text-emerald-300">
                        Last refresh added {lastInsertedRows.toLocaleString()} event(s).
                    </p>
                )}
                {error && (
                    <p data-testid="acceleration-error" role="alert" className="text-red-300">
                        {error}
                    </p>
                )}
            </div>

            <div className="flex items-center gap-2">
                {!enabled ? (
                    <button
                        type="button"
                        data-testid="acceleration-enable-btn"
                        onClick={onEnable}
                        disabled={isBusy}
                        className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold"
                    >
                        {busy === 'enabling' ? 'Creating & backfilling…' : 'Enable Acceleration'}
                    </button>
                ) : (
                    <>
                        <button
                            type="button"
                            data-testid="acceleration-refresh-btn"
                            onClick={onRefresh}
                            disabled={isBusy}
                            className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold"
                        >
                            {busy === 'refreshing' ? 'Refreshing…' : 'Refresh Acceleration'}
                        </button>
                        {confirmDisable ? (
                            <>
                                <span className="text-gray-400">Drop {ACCELERATION_TABLE_ID}?</span>
                                <button
                                    type="button"
                                    data-testid="acceleration-disable-confirm-btn"
                                    onClick={() => {
                                        setConfirmDisable(false);
                                        onDisable();
                                    }}
                                    disabled={isBusy}
                                    className="px-2.5 py-1.5 rounded bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white"
                                >
                                    Yes, drop
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setConfirmDisable(false)}
                                    className="px-2.5 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white"
                                >
                                    Cancel
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                data-testid="acceleration-disable-btn"
                                onClick={() => setConfirmDisable(true)}
                                disabled={isBusy}
                                className="px-2.5 py-1.5 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 border border-gray-700"
                            >
                                {busy === 'disabling' ? 'Dropping…' : 'Disable'}
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default ObservabilityAccelerationPanel;
