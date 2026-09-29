/**
 * Copyright 2026 Google LLC
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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TransferAgentOwnershipModal from './TransferAgentOwnershipModal';
import * as api from '../../services/apiService';
import { Agent, Config, IamPolicy } from '../../types';

vi.mock('../../services/apiService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/apiService')>();
  return {
    ...actual,
    transferAgentOwner: vi.fn(),
    getAgentIamPolicy: vi.fn(),
  };
});

describe('TransferAgentOwnershipModal', () => {
  const mockConfig: Config = {
    projectId: 'my-enterprise-project',
    appLocation: 'global',
    collectionId: 'default_collection',
    appId: 'my-engine',
    assistantId: 'default_assistant',
  };

  const mockAgent: Agent = {
    name: 'projects/my-enterprise-project/locations/global/collections/default_collection/engines/my-engine/assistants/default_assistant/agents/agent-42',
    displayName: 'HR Onboarding Assistant',
    state: 'ENABLED',
    lowCodeAgentDefinition: { nodes: [] },
  };

  const mockPolicy: IamPolicy = {
    etag: 'etag-1',
    bindings: [
      {
        role: 'roles/discoveryengine.agentOwner',
        members: ['user:former-employee@example.com'],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays current owner from IAM policy and transfers ownership to Myself by default', async () => {
    const updatedPolicy: IamPolicy = {
      etag: 'etag-2',
      bindings: [
        {
          role: 'roles/discoveryengine.agentOwner',
          members: ['user:admin@example.com'],
        },
        {
          role: 'roles/discoveryengine.agentUser',
          members: ['user:former-employee@example.com'],
        },
      ],
    };

    vi.mocked(api.transferAgentOwner).mockResolvedValueOnce({});
    vi.mocked(api.getAgentIamPolicy).mockResolvedValueOnce(updatedPolicy);

    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <TransferAgentOwnershipModal
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
        agent={mockAgent}
        config={mockConfig}
        currentPolicy={mockPolicy}
      />,
    );

    expect(screen.getByText(/user:former-employee@example\.com/i)).toBeDefined();
    expect(screen.getByText(/Schedule & Event Triggers Disabled/i)).toBeDefined();

    const submitBtn = screen.getByRole('button', { name: /Transfer Ownership/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.transferAgentOwner).toHaveBeenCalledWith(
        mockAgent.name,
        {
          toSelf: true,
          targetPrincipal: undefined,
          previousOwnerDisposition: 'KEEP_AS_AGENT_USER',
        },
        mockConfig,
      );
      expect(onSuccess).toHaveBeenCalledWith(updatedPolicy);
    });
  });

  it('transfers ownership to another user with formatted email or WIF principal', async () => {
    vi.mocked(api.transferAgentOwner).mockResolvedValueOnce({});
    vi.mocked(api.getAgentIamPolicy).mockResolvedValueOnce(mockPolicy);

    const onSuccess = vi.fn();

    render(
      <TransferAgentOwnershipModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={onSuccess}
        agent={mockAgent}
        config={mockConfig}
        currentPolicy={mockPolicy}
      />,
    );

    const otherRadio = screen.getByRole('radio', { name: /Another user/i });
    fireEvent.click(otherRadio);

    const input = screen.getByLabelText(/New Owner Email or Workforce Identity Principal/i);
    fireEvent.change(input, { target: { value: 'new.owner@example.com' } });

    const dispositionSelect = screen.getByLabelText(/Previous Owner Access After Transfer/i);
    fireEvent.change(dispositionSelect, { target: { value: 'REMOVE' } });

    const submitBtn = screen.getByRole('button', { name: /Transfer Ownership/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.transferAgentOwner).toHaveBeenCalledWith(
        mockAgent.name,
        {
          toSelf: false,
          targetPrincipal: 'user:new.owner@example.com',
          previousOwnerDisposition: 'REMOVE',
        },
        mockConfig,
      );
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('rejects invalid or group/public principals before calling the API', async () => {
    const onSuccess = vi.fn();

    render(
      <TransferAgentOwnershipModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={onSuccess}
        agent={mockAgent}
        config={mockConfig}
        currentPolicy={mockPolicy}
      />,
    );

    const otherRadio = screen.getByRole('radio', { name: /Another user/i });
    fireEvent.click(otherRadio);

    const input = screen.getByLabelText(/New Owner Email or Workforce Identity Principal/i);
    fireEvent.change(input, { target: { value: 'group:admins@example.com' } });

    const submitBtn = screen.getByRole('button', { name: /Transfer Ownership/i });
    fireEvent.click(submitBtn);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('single user identity');
    expect(api.transferAgentOwner).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('surfaces API 403 error message in an alert when transferAgentOwner fails', async () => {
    vi.mocked(api.transferAgentOwner).mockRejectedValueOnce(
      new Error('403 Forbidden: Missing roles/discoveryengine.agentspaceAdmin'),
    );

    const onSuccess = vi.fn();

    render(
      <TransferAgentOwnershipModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={onSuccess}
        agent={mockAgent}
        config={mockConfig}
        currentPolicy={mockPolicy}
      />,
    );

    const submitBtn = screen.getByRole('button', { name: /Transfer Ownership/i });
    fireEvent.click(submitBtn);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('403 Forbidden: Missing roles/discoveryengine.agentspaceAdmin');
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
