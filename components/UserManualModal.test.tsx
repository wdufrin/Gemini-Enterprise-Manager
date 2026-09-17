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
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import UserManualModal from './UserManualModal';

describe('UserManualModal Integration', () => {
  it('renders UserGuideModal when isOpen is true', () => {
    const onClose = vi.fn();
    render(<UserManualModal isOpen={true} onClose={onClose} />);

    expect(screen.getByText(/Gemini Enterprise Manager/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search topics, tabs, cURL commands/i)).toBeInTheDocument();
  });

  it('triggers onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<UserManualModal isOpen={true} onClose={onClose} />);

    const closeBtn = screen.getByLabelText(/Close dialog/i);
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalled();
  });
});
