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
import SkillsViewer from './SkillsViewer';
import { Agent, AppEngine, Config, UserProfile } from '../../types';
import * as api from '../../services/apiService';
import { ToastProvider } from '../../context/ToastContext';

vi.mock('../../services/apiService', () => ({
  createSkillAgent: vi.fn(),
  updateAgent: vi.fn(),
  deleteSkillAgent: vi.fn(),
  ensureSkillSharingOnEngine: vi.fn(),
  suspendAgent: vi.fn(),
  rejectAgent: vi.fn(),
  enableAgent: vi.fn(),
  disableAgent: vi.fn(),
}));

const mockConfig: Config = {
  projectId: 'test-project-123',
  appLocation: 'global',
  collectionId: 'default_collection',
  appId: 'test-engine-id',
  assistantId: 'default_assistant',
};

const mockUserProfile: UserProfile = {
  email: 'admin@company.com',
  name: 'Admin User',
  picture: 'https://example.com/photo.jpg',
};

const mockAgents: Agent[] = [
  {
    name: 'projects/123/locations/global/collections/default_collection/engines/engine/assistants/assistant/agents/org-skill-1',
    displayName: 'Corporate Financial Forecaster',
    description: 'Calculates quarterly financial projections using standard GAAP models.',
    state: 'ENABLED',
    agentType: 'SKILL',
    skillAgentDefinition: {
      agentRegistrySkill: 'projects/123/locations/global/skills/fin-forecaster',
      instruction: '# GAAP Financial Guidelines\nApply standard discount rates.',
    },
  },
  {
    name: 'projects/123/locations/global/collections/default_collection/engines/engine/assistants/assistant/agents/user-skill-2',
    displayName: 'Personal SQL Optimizer',
    description: 'Formats and optimizes BigQuery queries according to my personal preferences.',
    state: 'PRIVATE',
    agentType: 'SKILL',
    skillAgentDefinition: {
      owner: 'principal://iam.googleapis.com/users/admin@company.com',
      instruction: '# SQL Styling\nAlways format keywords in uppercase.',
    },
  },
  {
    name: 'projects/123/locations/global/collections/default_collection/engines/engine/assistants/assistant/agents/normal-a2a-agent',
    displayName: 'Employee Skill Assessment Bot',
    description: 'Standard A2A agent whose title contains the word skill.',
    state: 'ENABLED',
    agentType: 'A2A',
  },
];

describe('SkillsViewer Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderWithToast = (ui: React.ReactElement) => {
    return render(<ToastProvider>{ui}</ToastProvider>);
  };

  it('renders skills list, classifies organizational vs user-created skills, and excludes non-skill agents with "skill" in displayName', () => {
    const onRefreshSkills = vi.fn();
    renderWithToast(
      <SkillsViewer
        agents={mockAgents}
        config={mockConfig}
        userProfile={mockUserProfile}
        onRefreshSkills={onRefreshSkills}
      />
    );

    expect(screen.getByText('Corporate Financial Forecaster')).toBeInTheDocument();
    expect(screen.getByText('Personal SQL Optimizer')).toBeInTheDocument();
    // Ensure false-positive non-skill agent is excluded
    expect(screen.queryByText('Employee Skill Assessment Bot')).not.toBeInTheDocument();
    expect(screen.getByText('🏢 Organization')).toBeInTheDocument();
    expect(screen.getByText('👤 User-Created')).toBeInTheDocument();
    expect(screen.getByText('Agent Registry')).toBeInTheDocument();
  });

  it('filters skills by scope/origin tab', () => {
    const onRefreshSkills = vi.fn();
    renderWithToast(
      <SkillsViewer
        agents={mockAgents}
        config={mockConfig}
        userProfile={mockUserProfile}
        onRefreshSkills={onRefreshSkills}
      />
    );

    // Click Org-wide filter button
    fireEvent.click(screen.getByRole('button', { name: /Org-wide/i }));
    expect(screen.getByText('Corporate Financial Forecaster')).toBeInTheDocument();
    expect(screen.queryByText('Personal SQL Optimizer')).not.toBeInTheDocument();

    // Click User-Created filter button
    fireEvent.click(screen.getByRole('button', { name: /User-Created/i }));
    expect(screen.queryByText('Corporate Financial Forecaster')).not.toBeInTheDocument();
    expect(screen.getByText('Personal SQL Optimizer')).toBeInTheDocument();
  });

  it('opens inspect modal and displays skill instructions and metadata', () => {
    const onRefreshSkills = vi.fn();
    renderWithToast(
      <SkillsViewer
        agents={mockAgents}
        config={mockConfig}
        userProfile={mockUserProfile}
        onRefreshSkills={onRefreshSkills}
      />
    );

    const inspectButtons = screen.getAllByTitle('Inspect Skill & Instructions');
    fireEvent.click(inspectButtons[0]);

    expect(screen.getByText(/Skill Execution Guidelines & Prompt/i)).toBeInTheDocument();
    expect(screen.getByText(/Apply standard discount rates/i)).toBeInTheDocument();
  });

  it('displays engine feature warning banner when skills or skill-sharing is FEATURE_STATE_OFF and allows one-click enablement', async () => {
    vi.mocked(api.ensureSkillSharingOnEngine).mockResolvedValue(undefined);
    const onRefreshSkills = vi.fn();
    const disabledEngine: AppEngine = {
      name: 'projects/123/locations/global/collections/default_collection/engines/test-engine-id',
      displayName: 'Test Engine',
      solutionType: 'SOLUTION_TYPE_CHAT',
      features: {
        skills: 'FEATURE_STATE_OFF',
        'skill-sharing': 'FEATURE_STATE_OFF',
      },
    };

    renderWithToast(
      <SkillsViewer
        agents={mockAgents}
        config={mockConfig}
        engine={disabledEngine}
        userProfile={mockUserProfile}
        onRefreshSkills={onRefreshSkills}
      />
    );

    expect(screen.getByTestId('skills-engine-feature-warning')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Enable Skill Features/i }));

    await waitFor(() => {
      expect(api.ensureSkillSharingOnEngine).toHaveBeenCalledWith(mockConfig);
      expect(onRefreshSkills).toHaveBeenCalled();
    });
  });

  it('opens Export Skills modal and switches between CSV and SKILL.md formats', () => {
    const onRefreshSkills = vi.fn();
    renderWithToast(
      <SkillsViewer
        agents={mockAgents}
        config={mockConfig}
        userProfile={mockUserProfile}
        onRefreshSkills={onRefreshSkills}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Export Skills/i }));
    expect(screen.getByText('Export Assistant Skills')).toBeInTheDocument();

    const preview = screen.getByTestId('skills-export-preview');
    expect(preview.textContent).toContain('skill_id,display_name,description');
    expect(preview.textContent).toContain('Corporate Financial Forecaster');

    fireEvent.click(screen.getByRole('button', { name: /SKILL\.md Bundle/i }));
    expect(preview.textContent).toContain('name: org-skill-1');
    expect(preview.textContent).toContain('# GAAP Financial Guidelines');
  });

  it('opens Add Skill modal and submits a new skill agent', async () => {
    vi.mocked(api.createSkillAgent).mockResolvedValue({} as Agent);
    const onRefreshSkills = vi.fn();

    renderWithToast(
      <SkillsViewer
        agents={mockAgents}
        config={mockConfig}
        userProfile={mockUserProfile}
        onRefreshSkills={onRefreshSkills}
      />
    );

    fireEvent.click(screen.getByText(/Add \/ Import Skill/i));
    expect(screen.getByText(/Add Skill to Assistant/i)).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText(/e\.g\. Sales Pipeline Analyst/i);
    fireEvent.change(nameInput, { target: { value: 'New Test Skill' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add Skill' }));

    await waitFor(() => {
      expect(api.createSkillAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'New Test Skill',
          state: 'ENABLED',
          skillAgentDefinition: expect.objectContaining({
            instruction: expect.stringContaining('Role & Capabilities'),
          }),
        }),
        mockConfig,
        'new-test-skill',
        true
      );
      expect(onRefreshSkills).toHaveBeenCalled();
    });
  });
});
