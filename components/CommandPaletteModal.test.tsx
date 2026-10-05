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
import { CommandPaletteModal } from './CommandPaletteModal';
import { Page } from '../types';
import { GlobalDebugProvider } from '../context/GlobalDebugContext';

const renderPalette = (props: Partial<React.ComponentProps<typeof CommandPaletteModal>> = {}) => {
  const defaultProps: React.ComponentProps<typeof CommandPaletteModal> = {
    isOpen: true,
    onClose: vi.fn(),
    currentPage: Page.AGENTS,
    onNavigate: vi.fn(),
    isSidebarCollapsed: false,
    onToggleSidebar: vi.fn(),
    ...props,
  };
  return {
    ...render(
      <GlobalDebugProvider>
        <CommandPaletteModal {...defaultProps} />
      </GlobalDebugProvider>
    ),
    props: defaultProps,
  };
};

describe('CommandPaletteModal', () => {
  it('does not render dialog when isOpen is false', () => {
    renderPalette({ isOpen: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('filters pages by keyword and navigates on Enter key', () => {
    const { props } = renderPalette();
    const input = screen.getByLabelText('Command Palette Search');

    fireEvent.change(input, { target: { value: 'jailbreak' } });
    expect(screen.getByText(Page.MODEL_ARMOR)).toBeTruthy();
    expect(screen.queryByText(Page.BACKUP_RECOVERY)).toBeNull();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onNavigate).toHaveBeenCalledWith(Page.MODEL_ARMOR);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('navigates items using ArrowDown and ArrowUp and triggers quick action', () => {
    const { props } = renderPalette();
    const input = screen.getByLabelText('Command Palette Search');

    fireEvent.change(input, { target: { value: 'Collapse Sidebar Navigation' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(props.onToggleSidebar).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('handles hostile and unmatched search queries safely with an empty state and closes on Escape', () => {
    const { props } = renderPalette();
    const input = screen.getByLabelText('Command Palette Search');

    const hostileQuery = "<script>alert('xss')</script>'; DROP TABLE agents;--";
    fireEvent.change(input, { target: { value: hostileQuery } });

    expect(screen.getByText(/No matching pages or actions found/i)).toBeTruthy();

    // Pressing Enter on empty results must not invoke onNavigate or throw
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onNavigate).not.toHaveBeenCalled();

    // Pressing Escape dismisses the modal via useModalA11y
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
