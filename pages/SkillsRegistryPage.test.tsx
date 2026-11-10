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
import { ToastProvider } from '../context/ToastContext';

vi.mock('../services/apiService', () => ({
  listRegistrySkills: vi.fn(),
  createRegistrySkill: vi.fn(),
  updateRegistrySkill: vi.fn(),
  updateRegistrySkillScanningPolicy: vi.fn(),
  deleteRegistrySkill: vi.fn(),
  listRegistrySkillRevisions: vi.fn(),
  listRegistryFindings: vi.fn(),
  listResources: vi.fn(),
  createAgent: vi.fn(),
  promoteSkillToOrg: vi.fn(),
}));

const mockUserProfile: UserProfile = {
  email: 'admin@company.com',
  name: 'Admin User',
  picture: 'https://example.com/photo.jpg',
};

const mockRegistrySkills: RegistrySkill[] = [
  {
    name: 'projects/test-project-123/locations/global/skills/private-company-brand-voice',
    displayName: 'Corporate Brand Voice',
    description: 'Enforces official company communication style and guidelines.',
    type: 'SIMPLE',
    state: 'STATE_ACTIVE',
    targetState: 'TARGET_STATE_ACTIVE',
    publisher: 'projects/test-project-123/locations/global/publishers/mycompany.com',
    skillId: 'urn:skill:mycompany.com:brand:corporate-brand-voice',
    scanningConfig: { policy: 'ENABLED_BLOCKING' },
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
    name: 'projects/test-project-123/locations/global/skills/private-draft-skill',
    displayName: 'Draft Skill',
    state: 'STATE_DRAFT',
    scanningConfig: { policy: 'DISABLED' },
  },
  {
    name: 'projects/test-project-123/locations/global/skills/private-deprecated-skill',
    displayName: 'Deprecated Skill',
    state: 'STATE_DEPRECATED',
  },
  {
    name: 'projects/test-project-123/locations/global/skills/private-unknown-skill',
    displayName: 'Unknown Skill',
    state: 'STATE_WEIRD',
  },
  {
    name: 'projects/test-project-123/locations/global/skills/private-admin-mcp-jira-tools-a1b2c3',
    displayName: 'Jira Custom MCP Skill',
    description: 'Auto-generated skill from Custom MCP connector (byomcp_signature:abc123)',
    state: 'STATE_ACTIVE',
  },
];

describe('SkillsRegistryPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listRegistrySkills).mockResolvedValue(mockRegistrySkills);
    vi.mocked(api.listRegistrySkillRevisions).mockResolvedValue([]);
    vi.mocked(api.listRegistryFindings).mockResolvedValue([]);
    vi.mocked(api.listResources).mockResolvedValue({ engines: [] });
  });

  const renderWithToast = (ui: React.ReactElement) => {
    return render(<ToastProvider>{ui}</ToastProvider>);
  };

  it('renders enterprise skills registry with v1 GA badge, auto-scan badges, and Data Connector MCP badge', async () => {
    renderWithToast(
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
      expect(screen.getByText('agentregistry.googleapis.com (v1 GA)')).toBeInTheDocument();
      expect(screen.getByText('Corporate Brand Voice')).toBeInTheDocument();
      expect(screen.getByText('gke-storage')).toBeInTheDocument();
      expect(screen.getByText('Jira Custom MCP Skill')).toBeInTheDocument();
      expect(screen.getByText('Data Connector MCP')).toBeInTheDocument();
      expect(screen.getAllByText('mycompany.com').length).toBeGreaterThan(0);
      expect(screen.getAllByText('cloud.google.com').length).toBeGreaterThan(0);
      expect(screen.getAllByText(/🛡️ Blocking/i).length).toBeGreaterThan(0);
    });
  });

  it('filters skills by search query and auto-scan policy, and opens Org Scan Policy YAML guide', async () => {
    renderWithToast(
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

    // Filter by DISABLED scan policy
    const scanFilter = screen.getByTestId('registry-scan-policy-filter');
    fireEvent.change(scanFilter, { target: { value: 'DISABLED' } });
    expect(screen.getByText('Draft Skill')).toBeInTheDocument();
    expect(screen.queryByText('Corporate Brand Voice')).not.toBeInTheDocument();

    // Reset scan filter and search by query
    fireEvent.change(scanFilter, { target: { value: 'ALL' } });
    const searchInput = screen.getByPlaceholderText(/Search skills by name/i);
    fireEvent.change(searchInput, { target: { value: 'gke' } });

    expect(screen.queryByText('Corporate Brand Voice')).not.toBeInTheDocument();
    expect(screen.getByText('gke-storage')).toBeInTheDocument();

    // Toggle Org Scan Policy constraint YAML panel
    fireEvent.click(screen.getByTestId('toggle-org-scan-policy-btn'));
    expect(screen.getByTestId('org-scan-policy-panel').textContent).toContain(
      'custom.skillsScanningEnforcement'
    );
  });

  it('opens Publish Enterprise Skill modal and submits new skill with ENABLED_BLOCKING scanningConfig', async () => {
    vi.mocked(api.createRegistrySkill).mockResolvedValue({
      name: 'projects/test-project-123/locations/global/skills/private-company-brand-voice',
      displayName: 'Company Brand Voice',
      state: 'STATE_ACTIVE',
    } as RegistrySkill);

    renderWithToast(
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
          targetState: 'TARGET_STATE_ACTIVE',
          scanningConfig: { policy: 'ENABLED_BLOCKING' },
        }),
        expect.objectContaining({ projectId: 'test-project-123' }),
        expect.any(String)
      );
    });
  });

  it('blocks activation in PublishSkillModal and displays alert when initial revision scan reports security findings', async () => {
    vi.mocked(api.createRegistrySkill).mockResolvedValueOnce({
      name: 'projects/test-project-123/locations/global/skills/private-company-brand-voice',
      displayName: 'Company Brand Voice',
      state: 'STATE_DRAFT',
    } as RegistrySkill);
    vi.mocked(api.listRegistrySkillRevisions).mockResolvedValueOnce([
      {
        name: 'projects/test-project-123/locations/global/skills/private-company-brand-voice/revisions/rev-1',
        state: 'ACTIVE',
        scanResult: {
          scanState: 'SUCCEEDED',
          findings: ['projects/test-project-123/locations/global/findings/f-1'],
        },
      },
    ]);

    renderWithToast(
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
    fireEvent.click(screen.getByRole('button', { name: /^Publish Enterprise Skill$/i }));

    const errBanner = await screen.findByTestId('publish-skill-error-banner');
    expect(errBanner.textContent).toContain('activation was blocked by Agent Registry Security Scanning');
    expect(errBanner.textContent).toContain('1 security finding');
  });

  it('updates per-skill scanningConfig.policy and renders Security Findings in RegistrySkillDetailModal', async () => {
    vi.mocked(api.listRegistrySkillRevisions).mockResolvedValue([
      {
        name: 'projects/test-project-123/locations/global/skills/private-company-brand-voice/revisions/rev-99',
        state: 'ACTIVE',
        scanResult: {
          scanState: 'SUCCEEDED',
          findings: ['projects/test-project-123/locations/global/findings/finding-secret-1'],
        },
      },
    ]);
    vi.mocked(api.listRegistryFindings).mockResolvedValue([
      {
        name: 'projects/test-project-123/locations/global/findings/finding-secret-1',
        resource:
          'projects/test-project-123/locations/global/skills/private-company-brand-voice/revisions/rev-99',
        severity: 'SEVERITY_CRITICAL',
        findingClass: 'SECRET',
        files: [{ path: 'scripts/upload.py', lineNumber: 14 }],
        detail: 'Hardcoded OAuth bearer token detected in scripts/upload.py.',
      },
    ]);
    vi.mocked(api.updateRegistrySkillScanningPolicy).mockResolvedValue({} as RegistrySkill);

    renderWithToast(
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

    fireEvent.click(screen.getAllByTitle('Inspect Skill & Revisions')[0]);

    // Update scanning policy from ENABLED_BLOCKING to ENABLED_NONBLOCKING
    const policySelect = await screen.findByTestId('registry-skill-scan-policy-select');
    fireEvent.change(policySelect, { target: { value: 'ENABLED_NONBLOCKING' } });
    fireEvent.click(screen.getByTestId('save-registry-scan-policy-btn'));

    await waitFor(() => {
      expect(api.updateRegistrySkillScanningPolicy).toHaveBeenCalledWith(
        'projects/test-project-123/locations/global/skills/private-company-brand-voice',
        'ENABLED_NONBLOCKING',
        expect.objectContaining({ projectId: 'test-project-123' })
      );
    });

    // Switch to Security Findings tab and verify critical secret finding is rendered
    fireEvent.click(screen.getByTestId('registry-skill-findings-tab'));
    const findingsList = await screen.findByTestId('registry-skill-findings-list');
    expect(findingsList.textContent).toContain('CRITICAL');
    expect(findingsList.textContent).toContain('SECRET');
    expect(findingsList.textContent).toContain('scripts/upload.py:14');
    expect(findingsList.textContent).toContain('Hardcoded OAuth bearer token detected');
  });

  it('renders skill states correctly including unknown states', async () => {
    renderWithToast(
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

  it('renders structured API error banner when listRegistrySkills fails with 403 and surfaces revision/engine warnings in RegistrySkillDetailModal', async () => {
    vi.mocked(api.listRegistrySkills).mockRejectedValueOnce(
      new Error('403 PERMISSION_DENIED: Cloud AI Companion API has not been used in project')
    );

    const { unmount } = renderWithToast(
      <SkillsRegistryPage
        projectNumber="123456789012"
        projectId="test-project-123"
        setProjectNumber={vi.fn()}
        accessToken="mock-token"
        userProfile={mockUserProfile}
      />
    );

    const errorBanner = await screen.findByTestId('skills-registry-error-banner');
    expect(errorBanner).toBeInTheDocument();
    expect(errorBanner.textContent).toMatch(/403|PERMISSION_DENIED|API/i);
    unmount();

    vi.mocked(api.listRegistrySkills).mockResolvedValue(mockRegistrySkills);
    vi.mocked(api.listRegistrySkillRevisions).mockRejectedValueOnce(
      new Error('500 Revisions backend error')
    );
    vi.mocked(api.listResources).mockRejectedValueOnce(new Error('403 Engine list forbidden'));

    renderWithToast(
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

    fireEvent.click(screen.getAllByTitle('Inspect Skill & Revisions')[0]);

    expect(await screen.findByTestId('registry-skill-warnings-banner')).toBeInTheDocument();
    expect(screen.getByTestId('registry-skill-warnings-banner').textContent).toMatch(
      /500 Revisions backend error/
    );
  });
});
