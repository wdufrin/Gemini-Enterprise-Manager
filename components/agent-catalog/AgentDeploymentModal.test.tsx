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
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AgentDeploymentModal from './AgentDeploymentModal';
import { getReasoningEngineDeployScript } from './deploymentScripts';
import * as api from '../../services/apiService';

vi.mock('../../services/apiService', () => ({
  getProject: vi.fn(),
  listBuckets: vi.fn(),
  getProjectIamPolicy: vi.fn(),
  setProjectIamPolicy: vi.fn(),
  uploadFileToGcs: vi.fn(),
  createCloudBuild: vi.fn(),
}));

describe('AgentDeploymentModal & deploymentScripts', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    agentName: 'GCP_Logs_Reader',
    files: [
      { name: 'agent.py', content: 'from google.adk.agents import Agent\nroot_agent = Agent(name="test")' },
      { name: 'requirements.txt', content: 'google-adk>=0.1.0\n' },
    ],
    projectNumber: '471216644420',
    initialBucket: 'staging_ge_no_vpc_sc',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getProject).mockResolvedValue({
      projectId: 'ge2-no-vpc-sc',
      projectNumber: '471216644420',
      name: 'ge2-no-vpc-sc',
    });
    vi.mocked(api.listBuckets).mockResolvedValue({
      items: [{ id: 'staging_ge_no_vpc_sc', name: 'staging_ge_no_vpc_sc' }],
    });
  });

  it('flags roles/storage.admin as missing when service accounts only have roles/storage.objectViewer', async () => {
    vi.mocked(api.getProjectIamPolicy).mockResolvedValue({
      bindings: [
        {
          role: 'roles/aiplatform.user',
          members: [
            'serviceAccount:471216644420@cloudbuild.gserviceaccount.com',
            'serviceAccount:471216644420-compute@developer.gserviceaccount.com',
          ],
        },
        {
          role: 'roles/storage.objectViewer',
          members: [
            'serviceAccount:471216644420@cloudbuild.gserviceaccount.com',
            'serviceAccount:471216644420-compute@developer.gserviceaccount.com',
          ],
        },
      ],
    });

    render(<AgentDeploymentModal {...defaultProps} />);

    await waitFor(() => {
      expect(api.getProjectIamPolicy).toHaveBeenCalledWith('ge2-no-vpc-sc');
    });

    // Should auto-expand the permissions card and flag roles/storage.admin as missing on both SAs
    await waitFor(() => {
      expect(screen.getByText('Missing on Cloud Build SA:')).toBeInTheDocument();
      expect(screen.getByText('Missing on Compute SA:')).toBeInTheDocument();
      expect(screen.getAllByText('roles/storage.admin')).toHaveLength(2);
    });
  });

  it('grants missing roles via setProjectIamPolicy when Grant Missing Permissions is clicked', async () => {
    vi.mocked(api.getProjectIamPolicy)
      .mockResolvedValueOnce({
        bindings: [
          {
            role: 'roles/aiplatform.user',
            members: [
              'serviceAccount:471216644420@cloudbuild.gserviceaccount.com',
              'serviceAccount:471216644420-compute@developer.gserviceaccount.com',
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        bindings: [
          {
            role: 'roles/aiplatform.user',
            members: [
              'serviceAccount:471216644420@cloudbuild.gserviceaccount.com',
              'serviceAccount:471216644420-compute@developer.gserviceaccount.com',
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        bindings: [
          {
            role: 'roles/aiplatform.user',
            members: [
              'serviceAccount:471216644420@cloudbuild.gserviceaccount.com',
              'serviceAccount:471216644420-compute@developer.gserviceaccount.com',
            ],
          },
          {
            role: 'roles/storage.admin',
            members: [
              'serviceAccount:471216644420@cloudbuild.gserviceaccount.com',
              'serviceAccount:471216644420-compute@developer.gserviceaccount.com',
            ],
          },
        ],
      });

    vi.mocked(api.setProjectIamPolicy).mockResolvedValue({ bindings: [] });

    render(<AgentDeploymentModal {...defaultProps} />);

    const grantBtn = await screen.findByRole('button', {
      name: /Grant Missing Permissions/i,
    });
    fireEvent.click(grantBtn);

    await waitFor(() => {
      expect(api.setProjectIamPolicy).toHaveBeenCalledWith(
        'ge2-no-vpc-sc',
        expect.objectContaining({
          bindings: expect.arrayContaining([
            {
              role: 'roles/storage.admin',
              members: [
                'serviceAccount:471216644420@cloudbuild.gserviceaccount.com',
                'serviceAccount:471216644420-compute@developer.gserviceaccount.com',
              ],
            },
          ]),
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('All permissions granted!')).toBeInTheDocument();
    });
  });

  it('generates deploy_re.py with dict env_vars and idempotent agent_engines.list() lookup', () => {
    const script = getReasoningEngineDeployScript('agent', 'root_agent', 'GCP_Logs_Reader');
    expect(script).toContain('env_vars = {}');
    expect(script).toContain('env_vars[key] = value');
    expect(script).not.toContain('env_vars.append(key)');
    expect(script).toContain('for existing in agent_engines.list():');
    expect(script).toContain('agent_engines.update(');
  });
});
