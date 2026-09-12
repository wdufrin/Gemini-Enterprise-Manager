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
import PruneLicensesModal from './PruneLicensesModal';

describe('PruneLicensesModal', () => {
  const mockLicenses = [
    {
      userPrincipal: 'active@example.com',
      lastLoginTime: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
      createTime: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      userPrincipal: 'inactive@example.com',
      lastLoginTime: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(), // 45 days ago
      createTime: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      userPrincipal: 'never@example.com',
      lastLoginTime: null,
      createTime: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days ago
    },
  ];

  const baseProps = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    userLicenses: mockLicenses,
    isDeleting: false,
  };

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<PruneLicensesModal {...baseProps} isOpen={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('calculates matches reactively using useMemo without stale closures', () => {
    render(<PruneLicensesModal {...baseProps} />);
    // With default 30 days: inactive@example.com (45 days) matches.
    expect(screen.getByText(/matching user identified/i)).toBeInTheDocument();
    expect(screen.getByText('inactive@example.com')).toBeInTheDocument();
    expect(screen.queryByText('active@example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('never@example.com')).not.toBeInTheDocument();
  });

  it('includes never-logged-in accounts when checkbox is toggled', () => {
    render(<PruneLicensesModal {...baseProps} />);
    const checkbox = screen.getByRole('checkbox', { name: /include never-logged-in users/i });
    fireEvent.click(checkbox);
    // Now both inactive@example.com and never@example.com match
    expect(screen.getByText(/matching users identified/i)).toBeInTheDocument();
    expect(screen.getByText('inactive@example.com')).toBeInTheDocument();
    expect(screen.getByText('never@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirm Prune \(2\)/i })).toBeInTheDocument();
  });

  it('updates matching users when days input changes', () => {
    render(<PruneLicensesModal {...baseProps} />);
    const daysInput = screen.getByRole('spinbutton', { name: /inactive threshold/i });
    fireEvent.change(daysInput, { target: { value: '2' } });
    // Active (5 days) and Inactive (45 days) both match
    expect(screen.getByText(/matching users identified/i)).toBeInTheDocument();
    expect(screen.getByText('active@example.com')).toBeInTheDocument();
    expect(screen.getByText('inactive@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirm Prune \(2\)/i })).toBeInTheDocument();
  });

  it('requires typing PRUNE before Confirm Prune button is unlocked', () => {
    render(<PruneLicensesModal {...baseProps} />);
    const confirmButton = screen.getByRole('button', { name: /Confirm Prune \(1\)/i });
    expect(confirmButton).toBeDisabled();

    const input = screen.getByPlaceholderText(/Type PRUNE to unlock/i);
    fireEvent.change(input, { target: { value: 'wrong' } });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(input, { target: { value: 'PRUNE' } });
    expect(confirmButton).toBeEnabled();

    fireEvent.click(confirmButton);
    expect(baseProps.onConfirm).toHaveBeenCalledWith(30, false);
  });

  it('exports CSV on clicking export button', () => {
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURLMock = vi.fn();
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = revokeObjectURLMock;

    render(<PruneLicensesModal {...baseProps} />);
    const exportBtn = screen.getByRole('button', { name: /Export Inactive Users \(CSV\)/i });
    fireEvent.click(exportBtn);

    expect(createObjectURLMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
  });
});
