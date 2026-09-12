/**
 * Copyright 2025 Google LLC
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
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DestructiveConfirmModal from './DestructiveConfirmModal';

describe('DestructiveConfirmModal', () => {
  const baseProps = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    title: 'Delete Production Engine',
    description: 'This will permanently destroy the selected engine.',
    confirmKeyword: 'DELETE',
  };

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <DestructiveConfirmModal {...baseProps} isOpen={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders title, description, and keyword prompt', () => {
    render(<DestructiveConfirmModal {...baseProps} />);
    expect(screen.getByText('Delete Production Engine')).toBeInTheDocument();
    expect(
      screen.getByText('This will permanently destroy the selected engine.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Permanently Delete' })).toBeDisabled();
  });

  it('displays consequences list when provided', () => {
    render(
      <DestructiveConfirmModal
        {...baseProps}
        consequences={[
          'All indexed data will be lost.',
          'Assigned agents will immediately stop responding.',
        ]}
      />
    );
    expect(screen.getByText('Irreversible Action Consequences')).toBeInTheDocument();
    expect(screen.getByText('All indexed data will be lost.')).toBeInTheDocument();
    expect(
      screen.getByText('Assigned agents will immediately stop responding.')
    ).toBeInTheDocument();
  });

  it('renders list of affected resources', () => {
    render(
      <DestructiveConfirmModal
        {...baseProps}
        resourceType="Engine"
        resources={[
          { name: 'projects/p/locations/global/engines/e1', details: 'Active' },
          { name: 'projects/p/locations/global/engines/e2', details: 'Staging' },
        ]}
      />
    );
    expect(screen.getByText('Target Engines (2)')).toBeInTheDocument();
    expect(screen.getByText('projects/p/locations/global/engines/e1')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders export button and triggers callback when provided', () => {
    const onExport = vi.fn();
    render(
      <DestructiveConfirmModal
        {...baseProps}
        onExport={onExport}
        exportButtonText="Download Backup JSON"
      />
    );
    const exportBtn = screen.getByRole('button', { name: 'Download Backup JSON' });
    expect(exportBtn).toBeInTheDocument();
    fireEvent.click(exportBtn);
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('keeps confirm button disabled until exact keyword is typed', () => {
    render(<DestructiveConfirmModal {...baseProps} confirmKeyword="REVOKE" />);
    const confirmBtn = screen.getByRole('button', { name: 'Permanently Delete' });
    const input = screen.getByPlaceholderText('Type REVOKE to confirm');

    expect(confirmBtn).toBeDisabled();

    // Partial input
    fireEvent.change(input, { target: { value: 'REVO' } });
    expect(confirmBtn).toBeDisabled();

    // Case mismatch or wrong word
    fireEvent.change(input, { target: { value: 'revoke' } });
    expect(confirmBtn).toBeDisabled();

    // Exact match
    fireEvent.change(input, { target: { value: 'REVOKE' } });
    expect(confirmBtn).not.toBeDisabled();
  });

  it('calls onConfirm when confirmed with valid keyword', () => {
    const onConfirm = vi.fn();
    render(<DestructiveConfirmModal {...baseProps} onConfirm={onConfirm} />);
    const input = screen.getByPlaceholderText('Type DELETE to confirm');
    const confirmBtn = screen.getByRole('button', { name: 'Permanently Delete' });

    fireEvent.change(input, { target: { value: 'DELETE' } });
    fireEvent.click(confirmBtn);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('triggers onConfirm on Enter key only when keyword matches', () => {
    const onConfirm = vi.fn();
    render(<DestructiveConfirmModal {...baseProps} onConfirm={onConfirm} />);
    const input = screen.getByPlaceholderText('Type DELETE to confirm');

    // Enter with partial input: does not trigger
    fireEvent.change(input, { target: { value: 'DEL' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onConfirm).not.toHaveBeenCalled();

    // Enter with exact input: triggers
    fireEvent.change(input, { target: { value: 'DELETE' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
