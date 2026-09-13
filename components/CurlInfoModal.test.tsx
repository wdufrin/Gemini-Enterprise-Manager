import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CurlInfoModal from './CurlInfoModal';
import { Page } from '../types';

describe('CurlInfoModal Component', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined)
      }
    });
  });

  it('renders commands for a known page key', () => {
    const onClose = vi.fn();
    render(<CurlInfoModal infoKey={Page.SKILLS_REGISTRY} onClose={onClose} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/API Commands for Skills Registry/i)).toBeInTheDocument();
    expect(screen.getByText('List Skills in Registry')).toBeInTheDocument();
  });

  it('honestly displays empty state when an unknown key is provided without falling back to Agents', () => {
    const onClose = vi.fn();
    render(<CurlInfoModal infoKey="TotallyUnknownPage" onClose={onClose} />);

    expect(screen.getByText(/No specific API command examples are available for "TotallyUnknownPage"/i)).toBeInTheDocument();
    // Must NOT contain commands for Agents
    expect(screen.queryByText('Create an ADK Agent')).not.toBeInTheDocument();
    expect(screen.queryByText('Get Agent View')).not.toBeInTheDocument();
  });

  it('renders commands for previously missing pages like Agent Permissions and Observability', () => {
    const onClose = vi.fn();
    const { rerender } = render(<CurlInfoModal infoKey={Page.AGENT_PERMISSIONS} onClose={onClose} />);

    expect(screen.getByText('Get Agent IAM Policy')).toBeInTheDocument();

    rerender(<CurlInfoModal infoKey={Page.OBSERVABILITY} onClose={onClose} />);
    expect(screen.getByText('Query Operational Analytics (BigQuery)')).toBeInTheDocument();
  });

  it('closes on Escape key press', () => {
    const onClose = vi.fn();
    render(<CurlInfoModal infoKey={Page.AGENTS} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('copies command to clipboard on copy button click', () => {
    const onClose = vi.fn();
    render(<CurlInfoModal infoKey={Page.SKILLS_REGISTRY} onClose={onClose} />);

    const copyButtons = screen.getAllByRole('button', { name: /copy/i });
    expect(copyButtons.length).toBeGreaterThan(0);
    fireEvent.click(copyButtons[0]);

    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });
});
