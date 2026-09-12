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
import { Agent, Config, UserProfile } from '../../types';
import * as api from '../../services/apiService';

vi.mock('../../services/apiService', () => ({
  createSkillAgent: vi.fn(),
  updateAgent: vi.fn(),
  deleteSkillAgent: vi.fn(),
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
];

describe('SkillsViewer Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders skills list and correctly classifies organizational vs user-created skills', () => {
    const onRefreshSkills = vi.fn();
    render(
      <SkillsViewer
        agents={mockAgents}
        config={mockConfig}
        userProfile={mockUserProfile}
        onRefreshSkills={onRefreshSkills}
      />
    );

    expect(screen.getByText('Corporate Financial Forecaster')).toBeInTheDocument();
    expect(screen.getByText('Personal SQL Optimizer')).toBeInTheDocument();
    expect(screen.getByText('🏢 Organization')).toBeInTheDocument();
    expect(screen.getByText('👤 User-Created')).toBeInTheDocument();
    expect(screen.getByText('Agent Registry')).toBeInTheDocument();
  });

  it('filters skills by scope tab', () => {
    const onRefreshSkills = vi.fn();
    render(
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
    render(
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

  it('opens Add Skill modal and submits a new skill agent', async () => {
    vi.mocked(api.createSkillAgent).mockResolvedValue({} as any);
    const onRefreshSkills = vi.fn();

    render(
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
