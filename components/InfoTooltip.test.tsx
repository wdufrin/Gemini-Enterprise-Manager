import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import InfoTooltip from './InfoTooltip';

describe('InfoTooltip Component', () => {
  it('renders info icon button and does not show tooltip initially', () => {
    render(<InfoTooltip text="Sample tooltip text" />);

    const button = screen.getByRole('button', { name: /More information/i });
    expect(button).toBeInTheDocument();
    expect(screen.queryByText('Sample tooltip text')).not.toBeInTheDocument();
  });

  it('shows tooltip on mouse enter and hides on mouse leave', () => {
    render(<InfoTooltip text="Hover explanation text" />);

    const button = screen.getByRole('button', { name: /More information/i });
    fireEvent.mouseEnter(button);
    expect(screen.getByText('Hover explanation text')).toBeInTheDocument();

    fireEvent.mouseLeave(button);
    expect(screen.queryByText('Hover explanation text')).not.toBeInTheDocument();
  });

  it('pins tooltip on click and unpins on Escape or close button click', () => {
    render(<InfoTooltip text="Pinned tooltip text" title="Tooltip Header" />);

    const button = screen.getByRole('button', { name: /More information/i });
    fireEvent.click(button);

    // Title and text are visible
    expect(screen.getByText('Tooltip Header')).toBeInTheDocument();
    expect(screen.getByText('Pinned tooltip text')).toBeInTheDocument();

    // Mouse leave does NOT close it because it is pinned
    fireEvent.mouseLeave(button);
    expect(screen.getByText('Pinned tooltip text')).toBeInTheDocument();

    // Close button dismisses it
    const closeBtn = screen.getByRole('button', { name: /Close tooltip/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByText('Pinned tooltip text')).not.toBeInTheDocument();

    // Re-open and test Escape key dismiss
    fireEvent.click(button);
    expect(screen.getByText('Pinned tooltip text')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Pinned tooltip text')).not.toBeInTheDocument();
  });

  it('applies position=bottom and align=right styling classes correctly', () => {
    render(
      <InfoTooltip
        text="Aligned text"
        position="bottom"
        align="right"
      />
    );

    const button = screen.getByRole('button', { name: /More information/i });
    fireEvent.mouseEnter(button);

    const tooltipElement = screen.getByRole('tooltip');
    expect(tooltipElement).toHaveClass('top-full');
    expect(tooltipElement).toHaveClass('mt-2');
    expect(tooltipElement).toHaveClass('right-0');
  });
});
