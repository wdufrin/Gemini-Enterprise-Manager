import React, { useRef, useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useModalA11y } from './useModalA11y';

const TestModalComponent: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  preventClose?: boolean;
}> = ({ isOpen, onClose, preventClose = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useModalA11y({
    isOpen,
    onClose,
    containerRef,
    initialFocusRef: inputRef,
    preventClose
  });

  if (!isOpen) return null;

  return (
    <div ref={containerRef} role="dialog" aria-modal="true">
      <input ref={inputRef} placeholder="First input" data-testid="input-1" />
      <button data-testid="button-1">Button 1</button>
      <button onClick={onClose} data-testid="close-btn">Close</button>
    </div>
  );
};

describe('useModalA11y', () => {
  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<TestModalComponent isOpen={true} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose on Escape if preventClose is true', () => {
    const onClose = vi.fn();
    render(<TestModalComponent isOpen={true} onClose={onClose} preventClose={true} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('locks body overflow while open and restores it when closed', () => {
    const onClose = vi.fn();
    const { rerender } = render(<TestModalComponent isOpen={true} onClose={onClose} />);

    expect(document.body.style.overflow).toBe('hidden');

    rerender(<TestModalComponent isOpen={false} onClose={onClose} />);
    expect(document.body.style.overflow).toBe('');
  });

  it('traps tab focus within the container elements', () => {
    const onClose = vi.fn();
    render(<TestModalComponent isOpen={true} onClose={onClose} />);

    const input = screen.getByTestId('input-1');
    const closeBtn = screen.getByTestId('close-btn');

    // Simulate focus on the last element and pressing Tab (should wrap to first)
    closeBtn.focus();
    expect(document.activeElement).toBe(closeBtn);

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(input);

    // Simulate Shift+Tab on first element (should wrap to last)
    input.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(closeBtn);
  });
});
