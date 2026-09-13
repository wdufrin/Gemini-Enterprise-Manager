import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ConfirmationModal from './ConfirmationModal';

describe('ConfirmationModal Component', () => {
  it('renders modal with title and content', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmationModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Confirm Action"
      >
        <p>Are you sure you want to proceed?</p>
      </ConfirmationModal>
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
  });

  it('closes on Escape key press when not confirming', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmationModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Escape Test"
      >
        <p>Content</p>
      </ConfirmationModal>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on Escape key press when isConfirming is true', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmationModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Confirming Test"
        isConfirming={true}
      >
        <p>Content</p>
      </ConfirmationModal>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('triggers onConfirm when clicking confirm button', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmationModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Submit Test"
      >
        <p>Content</p>
      </ConfirmationModal>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
