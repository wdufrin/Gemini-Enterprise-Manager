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
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ObservabilityAccelerationPanel } from './ObservabilityAccelerationPanel';

const baseProps = {
    enabled: true,
    watermark: new Date('2026-11-06T09:30:00Z'),
    busy: null,
    error: null,
    lastInsertedRows: null,
    onEnable: vi.fn(),
    onRefresh: vi.fn(),
    onDisable: vi.fn(),
};

describe('ObservabilityAccelerationPanel', () => {
    it('requires a second confirmation click before dropping, and Cancel aborts', () => {
        const onDisable = vi.fn();
        render(<ObservabilityAccelerationPanel {...baseProps} onDisable={onDisable} />);

        fireEvent.click(screen.getByTestId('acceleration-disable-btn'));
        expect(onDisable).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onDisable).not.toHaveBeenCalled();
        expect(screen.getByTestId('acceleration-disable-btn')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('acceleration-disable-btn'));
        fireEvent.click(screen.getByTestId('acceleration-disable-confirm-btn'));
        expect(onDisable).toHaveBeenCalledTimes(1);
    });

    it('disables every action while any acceleration operation is running', () => {
        render(<ObservabilityAccelerationPanel {...baseProps} busy="refreshing" />);
        expect(screen.getByTestId('acceleration-refresh-btn')).toBeDisabled();
        expect(screen.getByTestId('acceleration-disable-btn')).toBeDisabled();
    });

    it('explains an empty table instead of showing a fake freshness time', () => {
        render(<ObservabilityAccelerationPanel {...baseProps} watermark={null} />);
        expect(screen.getByTestId('acceleration-freshness')).toHaveTextContent(/Acceleration table is empty/);
        expect(screen.getByTestId('acceleration-freshness')).not.toHaveTextContent(/Accelerated through/);
    });

    it('shows only the Enable action when acceleration is off', () => {
        const onEnable = vi.fn();
        render(<ObservabilityAccelerationPanel {...baseProps} enabled={false} watermark={null} onEnable={onEnable} />);
        expect(screen.queryByTestId('acceleration-refresh-btn')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('acceleration-enable-btn'));
        expect(onEnable).toHaveBeenCalledTimes(1);
    });
});
