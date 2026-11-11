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
  setSkillDefaultInstallForAllUsers: vi.fn(),
  deleteSkillAgent: vi.fn(),
  ensureSkillSharingOnEngine: vi.fn(),
  updateEngine: vi.fn(),
  scanSkillMarkdownViaRegistry: vi.fn(),
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

  it('warns when skill-sharing-without-admin-approval is FEATURE_STATE_ON and enforces admin approval on click', async () => {
    vi.mocked(api.updateEngine).mockResolvedValue({} as AppEngine);
    const onRefreshSkills = vi.fn();
    const unreviewedEngine: AppEngine = {
      name: 'projects/123/locations/global/collections/default_collection/engines/test-engine-id',
      displayName: 'Test Engine',
      solutionType: 'SOLUTION_TYPE_CHAT',
      features: {
        skills: 'FEATURE_STATE_ON',
        'skill-sharing': 'FEATURE_STATE_ON',
        'skill-sharing-without-admin-approval': 'FEATURE_STATE_ON',
      },
    };

    renderWithToast(
      <SkillsViewer
        agents={mockAgents}
        config={mockConfig}
        engine={unreviewedEngine}
        userProfile={mockUserProfile}
        onRefreshSkills={onRefreshSkills}
      />
    );

    expect(screen.getByTestId('skills-unreviewed-sharing-warning')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('require-skill-admin-approval-btn'));

    await waitFor(() => {
      expect(api.updateEngine).toHaveBeenCalledWith(
        unreviewedEngine.name,
        {
          features: {
            skills: 'FEATURE_STATE_ON',
            'skill-sharing': 'FEATURE_STATE_ON',
            'skill-sharing-without-admin-approval': 'FEATURE_STATE_OFF',
          },
        },
        ['features'],
        mockConfig
      );
      expect(onRefreshSkills).toHaveBeenCalled();
    });
  });

  it('runs Scan via Registry inside SkillDetailModal and surfaces critical prompt-injection findings before promotion', async () => {
    vi.mocked(api.scanSkillMarkdownViaRegistry).mockResolvedValueOnce({
      skillResourceName:
        'projects/test-project-123/locations/global/skills/private-gem-scan-org-skill-1',
      revisionName:
        'projects/test-project-123/locations/global/skills/private-gem-scan-org-skill-1/revisions/rev-1',
      scanResult: {
        scanState: 'SUCCEEDED',
        findings: ['projects/test-project-123/locations/global/findings/f-inj-1'],
      },
      findings: [
        {
          name: 'projects/test-project-123/locations/global/findings/f-inj-1',
          resource:
            'projects/test-project-123/locations/global/skills/private-gem-scan-org-skill-1/revisions/rev-1',
          severity: 'SEVERITY_CRITICAL',
          findingClass: 'VULNERABILITY',
          files: [{ path: 'SKILL.md', lineNumber: 3 }],
          detail: 'Instruction attempts to exfiltrate financial table rows to external endpoint.',
        },
      ],
      cleanedUp: true,
    });

    renderWithToast(
      <SkillsViewer
        agents={mockAgents}
        config={mockConfig}
        userProfile={mockUserProfile}
        onRefreshSkills={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText('Inspect Corporate Financial Forecaster'));
    const scanBtn = await screen.findByTestId('scan-skill-via-registry-btn');
    fireEvent.click(scanBtn);

    const verdictPanel = await screen.findByTestId('skill-security-scan-verdict');
    expect(verdictPanel.textContent).toContain('Security Risks Detected (1 Finding) — Do Not Promote');
    expect(verdictPanel.textContent).toContain('CRITICAL');
    expect(verdictPanel.textContent).toContain('VULNERABILITY');
    expect(verdictPanel.textContent).toContain('SKILL.md:3');
    expect(verdictPanel.textContent).toContain('exfiltrate financial table rows');
  });

  it('supports pre-install for all users in AddSkillModal and resets when switching to Personal scope', async () => {
    vi.mocked(api.createSkillAgent).mockResolvedValue({
      name: 'projects/test-project-123/locations/global/collections/default_collection/engines/test-engine-id/assistants/default_assistant/agents/preinstalled-skill',
      displayName: 'Preinstalled Policy Helper',
      state: 'ENABLED',
      defaultAgentUserData: { installed: true, disabled: false },
    } as Agent);
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

    const preinstallCheckbox = screen.getByTestId('add-skill-preinstall-checkbox') as HTMLInputElement;
    expect(preinstallCheckbox.checked).toBe(false);

    // Switching to Personal scope hides the org pre-install checkbox
    fireEvent.click(screen.getByDisplayValue('USER_CREATED'));
    expect(screen.queryByTestId('add-skill-preinstall-checkbox')).not.toBeInTheDocument();

    // Switching back to Organizational scope shows it unchecked and allows enabling
    fireEvent.click(screen.getByDisplayValue('ORGANIZATIONAL'));
    const restoredCheckbox = screen.getByTestId('add-skill-preinstall-checkbox') as HTMLInputElement;
    expect(restoredCheckbox.checked).toBe(false);
    fireEvent.click(restoredCheckbox);
    expect(restoredCheckbox.checked).toBe(true);

    const nameInput = screen.getByPlaceholderText(/e\.g\. Sales Pipeline Analyst/i);
    fireEvent.change(nameInput, { target: { value: 'Preinstalled Policy Helper' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Skill' }));

    await waitFor(() => {
      expect(api.createSkillAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Preinstalled Policy Helper',
          state: 'ENABLED',
        }),
        mockConfig,
        'preinstalled-policy-helper',
        true,
        true
      );
      expect(onRefreshSkills).toHaveBeenCalled();
    });
  });

  it('renders Pre-installed badge in SkillsViewer and toggles pre-install inside SkillDetailModal (including error handling)', async () => {
    const preinstalledOrgSkill: Agent = {
      ...mockAgents[0],
      defaultAgentUserData: { installed: true, disabled: false },
    };
    const onRefreshSkills = vi.fn();

    vi.mocked(api.setSkillDefaultInstallForAllUsers).mockResolvedValueOnce({
      ...mockAgents[0],
      defaultAgentUserData: { installed: true, disabled: false },
    });

    const { rerender } = renderWithToast(
      <SkillsViewer
        agents={mockAgents}
        config={mockConfig}
        userProfile={mockUserProfile}
        onRefreshSkills={onRefreshSkills}
      />
    );

    // Initially mockAgents[0] is not pre-installed
    expect(screen.queryByTestId('skill-row-preinstalled-badge')).not.toBeInTheDocument();

    // Open SkillDetailModal and pre-install via footer action
    fireEvent.click(screen.getByLabelText('Inspect Corporate Financial Forecaster'));
    const preinstallBtn = await screen.findByTestId('footer-toggle-skill-preinstall-btn');
    expect(preinstallBtn).toHaveTextContent(/Pre-install for All Users/i);
    fireEvent.click(preinstallBtn);

    await waitFor(() => {
      expect(api.setSkillDefaultInstallForAllUsers).toHaveBeenCalledWith(
        mockAgents[0],
        true,
        mockConfig
      );
      expect(onRefreshSkills).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByTestId('skill-detail-preinstalled-badge')).toBeInTheDocument();

    // Negative test: API error when removing pre-install must show error toast and keep badge intact
    vi.mocked(api.setSkillDefaultInstallForAllUsers).mockRejectedValueOnce(
      new Error('403 PERMISSION_DENIED: UpdateAgent disallowed')
    );
    fireEvent.click(screen.getByTestId('footer-toggle-skill-preinstall-btn'));

    await waitFor(() => {
      expect(
        screen.getByText(/Failed to update pre-install setting: 403 PERMISSION_DENIED/i)
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId('skill-detail-preinstalled-badge')).toBeInTheDocument();

    // Rerender with preinstalled skill in table and verify row badge appears
    rerender(
      <ToastProvider>
        <SkillsViewer
          agents={[preinstalledOrgSkill, mockAgents[1]]}
          config={mockConfig}
          userProfile={mockUserProfile}
          onRefreshSkills={onRefreshSkills}
        />
      </ToastProvider>
    );
    expect(screen.getByTestId('skill-row-preinstalled-badge')).toBeInTheDocument();
  });
});
