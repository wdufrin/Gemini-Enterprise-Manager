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

    expect(screen.getByText(/Skill Execution Guidelines & Markdown/i)).toBeInTheDocument();
    expect(screen.getByText(/Apply standard discount rates/i)).toBeInTheDocument();
  });

  it('allows editing global SKILL.md Markdown instructions (including full YAML frontmatter mode) and rejects empty or malformed frontmatter (negative tests)', async () => {
    vi.mocked(api.updateAgent).mockResolvedValue(mockAgents[0]);
    const onRefreshSkills = vi.fn();

    renderWithToast(
      <SkillsViewer
        agents={mockAgents}
        config={mockConfig}
        userProfile={mockUserProfile}
        onRefreshSkills={onRefreshSkills}
      />
    );

    // Click the Edit SKILL.md button directly on the first row
    fireEvent.click(
      screen.getByLabelText('Edit SKILL.md for Corporate Financial Forecaster')
    );

    expect(screen.getByTestId('skill-md-editor-panel')).toBeInTheDocument();
    const mdTextarea = screen.getByTestId('edit-skill-markdown-textarea') as HTMLTextAreaElement;
    expect(mdTextarea.value).toContain('# GAAP Financial Guidelines');

    // Negative check 1: Empty instructions should be rejected without calling api.updateAgent
    fireEvent.change(mdTextarea, { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('save-skill-md-btn'));
    expect(
      screen.getByText(/Skill Markdown instructions \(SKILL\.md\) cannot be empty/i)
    ).toBeInTheDocument();
    expect(api.updateAgent).not.toHaveBeenCalled();

    // Switch to Full SKILL.md (with YAML Frontmatter) mode and test malformed frontmatter (Negative check 2)
    fireEvent.change(mdTextarea, { target: { value: '# Valid Body' } });
    fireEvent.click(screen.getByRole('button', { name: /Full `SKILL\.md`/i }));

    const fullMdTextarea = screen.getByTestId('edit-full-skill-md-textarea') as HTMLTextAreaElement;
    fireEvent.change(fullMdTextarea, {
      target: { value: '---\nname: org-skill-1\ndescription: unclosed frontmatter\n# Body' },
    });
    fireEvent.click(screen.getByTestId('save-skill-md-btn'));
    expect(
      screen.getByText(/Malformed SKILL\.md YAML frontmatter/i)
    ).toBeInTheDocument();
    expect(api.updateAgent).not.toHaveBeenCalled();

    // Positive check: Valid Full SKILL.md updates both description and instruction via api.updateAgent
    fireEvent.change(fullMdTextarea, {
      target: {
        value: [
          '---',
          'name: org-skill-1',
          'description: Updated GAAP revenue & margin forecasting trigger.',
          '---',
          '',
          '# Updated GAAP Financial Guidelines',
          '1. Query the single authoritative finance table.',
          '2. Apply ASC 606 recognition rules.',
        ].join('\n'),
      },
    });
    fireEvent.click(screen.getByTestId('save-skill-md-btn'));

    await waitFor(() => {
      expect(api.updateAgent).toHaveBeenCalledWith(
        mockAgents[0],
        expect.objectContaining({
          displayName: 'Corporate Financial Forecaster',
          description: 'Updated GAAP revenue & margin forecasting trigger.',
          skillAgentDefinition: expect.objectContaining({
            instruction:
              '# Updated GAAP Financial Guidelines\n1. Query the single authoritative finance table.\n2. Apply ASC 606 recognition rules.',
          }),
        }),
        mockConfig
      );
      expect(onRefreshSkills).toHaveBeenCalled();
    });
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

  it('supports bulk selection (individual and Select All) and bulk deletion of skills, and surfaces partial API failures without swallowing errors', async () => {
    vi.mocked(api.deleteSkillAgent)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('403 PERMISSION_DENIED: cannot delete private skill'));
    const onRefreshSkills = vi.fn();

    renderWithToast(
      <SkillsViewer
        agents={mockAgents}
        config={mockConfig}
        userProfile={mockUserProfile}
        onRefreshSkills={onRefreshSkills}
      />
    );

    // Initially bulk action bar is hidden
    expect(screen.queryByTestId('skills-bulk-action-bar')).not.toBeInTheDocument();

    // Click "Select all visible skills" header checkbox
    const selectAllCheckbox = screen.getByLabelText('Select all visible skills');
    fireEvent.click(selectAllCheckbox);

    // Bulk action bar appears showing "2 selected"
    expect(screen.getByTestId('skills-bulk-action-bar')).toBeInTheDocument();
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    // Open bulk delete confirmation modal
    fireEvent.click(screen.getByTestId('bulk-delete-skills-button'));
    expect(screen.getByText('Delete 2 Selected Skills')).toBeInTheDocument();

    // Confirm bulk delete
    fireEvent.click(screen.getByRole('button', { name: 'Delete 2 Skills' }));

    await waitFor(() => {
      expect(api.deleteSkillAgent).toHaveBeenCalledTimes(2);
      expect(api.deleteSkillAgent).toHaveBeenCalledWith(mockAgents[0].name, mockConfig);
      expect(api.deleteSkillAgent).toHaveBeenCalledWith(mockAgents[1].name, mockConfig);
      expect(onRefreshSkills).toHaveBeenCalledTimes(1);
    });

    // Negative assertion: the 1 skill that failed with 403 remains selected so the user knows which item failed, and the error toast is rendered
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.getByText(/403 PERMISSION_DENIED/i)).toBeInTheDocument();
  });
});
