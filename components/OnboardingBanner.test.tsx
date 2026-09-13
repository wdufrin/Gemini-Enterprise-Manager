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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OnboardingBanner } from './OnboardingBanner';
import { Page } from '../types';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('OnboardingBanner', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders onboarding banner when not dismissed', () => {
    render(
      <OnboardingBanner
        projectId="test-project"
        projectNumber="123456789"
        accessToken="mock-token-abc"
        onNavigate={vi.fn()}
      />
    );

    expect(screen.getByRole('region', { name: /first-run guided onboarding/i })).toBeInTheDocument();
    expect(screen.getByText('Welcome to Gemini Enterprise Manager')).toBeInTheDocument();
    expect(screen.getByText('Quick Start Guide')).toBeInTheDocument();
  });

  it('does not render if previously dismissed in localStorage', () => {
    localStorage.setItem('gem_onboarding_dismissed_v1', 'true');

    const { container } = render(
      <OnboardingBanner
        projectId="test-project"
        projectNumber="123456789"
        accessToken="mock-token-abc"
        onNavigate={vi.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('dismisses banner and sets localStorage when dismiss button is clicked', () => {
    render(
      <OnboardingBanner
        projectId="test-project"
        projectNumber="123456789"
        accessToken="mock-token-abc"
        onNavigate={vi.fn()}
      />
    );

    const dismissBtn = screen.getByRole('button', { name: /dismiss onboarding guide/i });
    fireEvent.click(dismissBtn);

    expect(localStorage.getItem('gem_onboarding_dismissed_v1')).toBe('true');
    expect(screen.queryByText('Welcome to Gemini Enterprise Manager')).not.toBeInTheDocument();
  });

  it('toggles collapse and expand when toggle button is clicked', () => {
    render(
      <OnboardingBanner
        projectId="test-project"
        projectNumber="123456789"
        accessToken="mock-token-abc"
        onNavigate={vi.fn()}
      />
    );

    const collapseBtn = screen.getByRole('button', { name: /collapse onboarding checklist/i });
    expect(screen.getByText('Authenticate')).toBeInTheDocument();

    fireEvent.click(collapseBtn);
    expect(screen.queryByText('Authenticate')).not.toBeInTheDocument();

    const expandBtn = screen.getByRole('button', { name: /expand onboarding checklist/i });
    fireEvent.click(expandBtn);
    expect(screen.getByText('Authenticate')).toBeInTheDocument();
  });

  it('navigates to relevant page when quick launch button is clicked', () => {
    const mockNavigate = vi.fn();
    render(
      <OnboardingBanner
        projectId="test-project"
        projectNumber="123456789"
        accessToken="mock-token-abc"
        onNavigate={mockNavigate}
      />
    );

    const enginesBtn = screen.getByRole('button', { name: /open engines & assistants/i });
    fireEvent.click(enginesBtn);

    expect(mockNavigate).toHaveBeenCalledWith(Page.ASSISTANT);
  });
});
