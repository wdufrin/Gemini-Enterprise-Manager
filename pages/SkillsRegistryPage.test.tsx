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
import SkillsRegistryPage from './SkillsRegistryPage';
import { RegistrySkill, UserProfile } from '../types';
import * as api from '../services/apiService';

vi.mock('../services/apiService', () => ({
  listRegistrySkills: vi.fn(),
  createRegistrySkill: vi.fn(),
  updateRegistrySkill: vi.fn(),
  deleteRegistrySkill: vi.fn(),
  listRegistrySkillRevisions: vi.fn(),
}));

const mockUserProfile: UserProfile = {
  email: 'admin@company.com',
  name: 'Admin User',
  picture: 'https://example.com/photo.jpg',
};

const mockRegistrySkills: RegistrySkill[] = [
  {
    name: 'projects/test-project-123/locations/global/skills/company-brand-voice',
    displayName: 'Corporate Brand Voice',
    description: 'Enforces official company communication style and guidelines.',
    type: 'SIMPLE',
    state: 'STATE_ACTIVE',
    targetState: 'TARGET_STATE_ACTIVE',
    publisher: 'projects/test-project-123/locations/global/publishers/mycompany.com',
    skillId: 'urn:skill:mycompany.com:brand:corporate-brand-voice',
  },
  {
    name: 'projects/test-project-123/locations/global/skills/cloud.google.com-gke-storage',
    displayName: 'gke-storage',
    description: 'Manages GKE storage including PVCs and GCS FUSE.',
    type: 'SIMPLE',
    state: 'STATE_ACTIVE',
    targetState: 'TARGET_STATE_ACTIVE',
    publisher: 'projects/test-project-123/locations/global/publishers/cloud.google.com',
    skillId: 'urn:skill:cloud.google.com:container:gke-storage',
  },
  {
    name: 'projects/test-project-123/locations/global/skills/draft-skill',
    displayName: 'Draft Skill',
    state: 'STATE_DRAFT',
  },
  {
    name: 'projects/test-project-123/locations/global/skills/deprecated-skill',
    displayName: 'Deprecated Skill',
    state: 'STATE_DEPRECATED',
  },
  {
    name: 'projects/test-project-123/locations/global/skills/unknown-skill',
    displayName: 'Unknown Skill',
    state: 'STATE_WEIRD',
  },
];

describe('SkillsRegistryPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listRegistrySkills).mockResolvedValue(mockRegistrySkills);
    vi.mocked(api.listRegistrySkillRevisions).mockResolvedValue([]);
  });

  it('renders enterprise skills registry with statistics and skill list', async () => {
    render(
      <SkillsRegistryPage
        projectNumber="123456789012"
        projectId="test-project-123"
        setProjectNumber={vi.fn()}
        accessToken="mock-token"
        userProfile={mockUserProfile}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Enterprise Skills Registry')).toBeInTheDocument();
      expect(screen.getByText('Corporate Brand Voice')).toBeInTheDocument();
      expect(screen.getByText('gke-storage')).toBeInTheDocument();
      expect(screen.getAllByText('mycompany.com').length).toBeGreaterThan(0);
      expect(screen.getAllByText('cloud.google.com').length).toBeGreaterThan(0);
    });
  });

  it('filters skills by search query', async () => {
    render(
      <SkillsRegistryPage
        projectNumber="123456789012"
        projectId="test-project-123"
        setProjectNumber={vi.fn()}
        accessToken="mock-token"
        userProfile={mockUserProfile}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Corporate Brand Voice')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search skills by name/i);
    fireEvent.change(searchInput, { target: { value: 'gke' } });

    expect(screen.queryByText('Corporate Brand Voice')).not.toBeInTheDocument();
    expect(screen.getByText('gke-storage')).toBeInTheDocument();
  });

  it('opens Publish Enterprise Skill modal and submits new skill', async () => {
    vi.mocked(api.createRegistrySkill).mockResolvedValue({} as any);
    vi.mocked(api.updateRegistrySkill).mockResolvedValue({} as any);

    render(
      <SkillsRegistryPage
        projectNumber="123456789012"
        projectId="test-project-123"
        setProjectNumber={vi.fn()}
        accessToken="mock-token"
        userProfile={mockUserProfile}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Corporate Brand Voice')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /\+ Publish Enterprise Skill/i }));
    expect(screen.getByText(/Publish Enterprise Skill to Central Registry/i)).toBeInTheDocument();

    const publishBtn = screen.getByRole('button', { name: /^Publish Enterprise Skill$/i });
    fireEvent.click(publishBtn);

    await waitFor(() => {
      expect(api.createRegistrySkill).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SIMPLE',
          targetState: 'TARGET_STATE_DRAFT',
        }),
        expect.objectContaining({ projectId: 'test-project-123' }),
        expect.any(String)
      );
    });
  });

  it('renders skill states correctly including unknown states', async () => {
    render(
      <SkillsRegistryPage
        projectNumber="123456789012"
        projectId="test-project-123"
        setProjectNumber={vi.fn()}
        accessToken="mock-token"
        userProfile={mockUserProfile}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/ACTIVE/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/DRAFT/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/DEPRECATED/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/WEIRD/i).length).toBeGreaterThan(0);
    });
  });
});
