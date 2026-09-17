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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import UserGuideModal from './UserGuideModal';

describe('UserGuideModal Component', () => {
  const mockOnClose = vi.fn();
  const mockOnNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock navigator.clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <UserGuideModal isOpen={false} onClose={mockOnClose} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders correctly when isOpen is true', () => {
    render(
      <UserGuideModal
        isOpen={true}
        onClose={mockOnClose}
        onNavigateToPage={mockOnNavigate}
      />
    );

    expect(screen.getByText(/Gemini Enterprise Manager/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search topics, tabs, cURL commands/i)).toBeInTheDocument();
    expect(screen.getByText(/Offline .md/i)).toBeInTheDocument();
  });

  it('renders category filter pills', () => {
    render(<UserGuideModal isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByRole('button', { name: /^All$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Getting Started$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Agent Management$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Security & Access$/i })).toBeInTheDocument();
  });

  it('filters topics when typing in the search input', async () => {
    render(<UserGuideModal isOpen={true} onClose={mockOnClose} />);

    const searchInput = screen.getByPlaceholderText(/Search topics, tabs, cURL commands/i);
    fireEvent.change(searchInput, { target: { value: 'Model Armor' } });

    await waitFor(() => {
      expect(screen.getByText(/\d+ matches found/i)).toBeInTheDocument();
      // Should show Model Armor in results list
      const modelArmorButtons = screen.getAllByText(/Model Armor/i);
      expect(modelArmorButtons.length).toBeGreaterThan(0);
    });
  });

  it('clears search input when clear button is clicked', async () => {
    render(<UserGuideModal isOpen={true} onClose={mockOnClose} />);

    const searchInput = screen.getByPlaceholderText(/Search topics, tabs, cURL commands/i);
    fireEvent.change(searchInput, { target: { value: 'Observability' } });

    expect(searchInput).toHaveValue('Observability');

    const clearButton = screen.getByTitle(/Clear search/i);
    fireEvent.click(clearButton);

    expect(searchInput).toHaveValue('');
    expect(screen.getByText(/Browsing \d+ topics/i)).toBeInTheDocument();
  });

  it('switches topics when clicking on a navigation item', async () => {
    render(<UserGuideModal isOpen={true} onClose={mockOnClose} />);

    // Find and click on "Signing in" section button
    const signingInButton = screen.getByRole('button', { name: /Signing in/i });
    fireEvent.click(signingInButton);

    await waitFor(() => {
      // Heading should show Signing in
      const headings = screen.getAllByRole('heading', { name: /Signing in/i });
      expect(headings.length).toBeGreaterThan(0);
    });
  });

  it('navigates with next/previous buttons', async () => {
    render(<UserGuideModal isOpen={true} onClose={mockOnClose} />);

    const nextBtn = screen.queryByRole('button', { name: /Next Topic/i });
    if (nextBtn) {
      fireEvent.click(nextBtn);
      // Selected topic should update
      expect(screen.getByRole('button', { name: /Previous Topic/i })).toBeInTheDocument();
    }
  });

  it('calls onClose when close button is clicked', () => {
    render(<UserGuideModal isOpen={true} onClose={mockOnClose} />);

    const closeBtn = screen.getByLabelText(/Close dialog/i);
    fireEvent.click(closeBtn);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('toggles maximize mode', () => {
    render(<UserGuideModal isOpen={true} onClose={mockOnClose} />);

    const maxBtn = screen.getByTitle(/Maximize window/i);
    fireEvent.click(maxBtn);

    expect(screen.getByTitle(/Restore window/i)).toBeInTheDocument();

    fireEvent.click(screen.getByTitle(/Restore window/i));
    expect(screen.getByTitle(/Maximize window/i)).toBeInTheDocument();
  });
});
