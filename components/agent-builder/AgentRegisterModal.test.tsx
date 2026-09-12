import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AgentRegisterModal, { AgentRegisterModalProps } from './AgentRegisterModal';
import * as api from '../../services/apiService';

vi.mock('../../services/apiService', () => ({
  listDiscoveryEngines: vi.fn().mockResolvedValue({
    engines: [
      { name: 'projects/123/locations/global/collections/default_collection/engines/engine-1', displayName: 'Support Engine' },
    ],
  }),
  listAuthorizations: vi.fn().mockResolvedValue({
    authorizations: [
      { name: 'projects/123/locations/global/authorizations/auth-1', displayName: 'OAuth 2.0 Auth' },
    ],
  }),
  createDiscoveryAgent: vi.fn().mockResolvedValue({
    name: 'projects/123/locations/global/collections/default_collection/engines/engine-1/assistants/default_assistant/agents/test-agent',
    displayName: 'Test Agent',
  }),
}));

describe('AgentRegisterModal', () => {
  const baseProps: AgentRegisterModalProps = {
    isOpen: true,
    onClose: vi.fn(),
    projectId: 'test-project',
    projectNumber: '123456789',
    builderTab: 'adk',
    agentName: 'test_agent',
    agentDescription: 'An awesome test agent',
    defaultReasoningEngine: 'projects/test-project/locations/us-central1/reasoningEngines/123',
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<AgentRegisterModal {...baseProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders modal header, inputs, and prefilled agent values', async () => {
    render(<AgentRegisterModal {...baseProps} />);

    expect(screen.getByText('🔗 Register Agent in Gemini Enterprise')).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('test_agent')).toHaveLength(2);
    expect(screen.getByDisplayValue('An awesome test agent')).toBeInTheDocument();
    expect(screen.getByDisplayValue(baseProps.defaultReasoningEngine!)).toBeInTheDocument();

    await waitFor(() => {
      expect(api.listDiscoveryEngines).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'test-project' })
      );
    });
  });

  it('allows selecting an engine and submitting registration successfully', async () => {
    render(<AgentRegisterModal {...baseProps} />);

    await waitFor(() => {
      expect(screen.getByText('Support Engine (engine-1)')).toBeInTheDocument();
    });

    const engineSelect = screen.getByRole('combobox', { name: 'Target Engine' });
    fireEvent.change(engineSelect, { target: { value: 'engine-1' } });

    const submitBtn = screen.getByRole('button', { name: 'Register in Gemini Enterprise' });
    expect(submitBtn).toBeEnabled();

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.createDiscoveryAgent).toHaveBeenCalledTimes(1);
      expect(baseProps.onSuccess).toHaveBeenCalledWith(
        expect.stringContaining('Successfully registered agent "Test Agent"')
      );
      expect(screen.getByText(/Successfully registered agent/i)).toBeInTheDocument();
    });
  });

  it('calls onClose when cancel or close button is clicked', () => {
    render(<AgentRegisterModal {...baseProps} />);

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);
    expect(baseProps.onClose).toHaveBeenCalled();
  });
});
