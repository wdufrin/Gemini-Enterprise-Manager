import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal Component', () => {
  it('renders modal with accessible dialog roles and title', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Test Modal Title" subtitle="Subtitle note">
        <div>Modal Content</div>
      </Modal>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Test Modal Title')).toBeInTheDocument();
    expect(screen.getByText('Subtitle note')).toBeInTheDocument();
    expect(screen.getByText('Modal Content')).toBeInTheDocument();
  });

  it('closes on Escape key press', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Escape Test">
        <div>Content</div>
      </Modal>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on Escape key press if preventClose is true', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Escape Test" preventClose={true}>
        <div>Content</div>
      </Modal>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes when clicking close button with aria-label', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Close Button Test">
        <div>Content</div>
      </Modal>
    );

    const closeBtn = screen.getByRole('button', { name: /close dialog/i });
    expect(closeBtn).toBeInTheDocument();
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when isOpen is false', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={false} onClose={onClose} title="Hidden Modal">
        <div>Hidden Content</div>
      </Modal>
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
