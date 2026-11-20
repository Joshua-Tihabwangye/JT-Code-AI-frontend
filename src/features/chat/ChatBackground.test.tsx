import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatBackground } from './ChatBackground';

describe('ChatBackground', () => {
  it('shows the waves in full on the landing page', () => {
    render(<ChatBackground />);
    const background = screen.getByTestId('chat-background');
    expect(background).not.toHaveClass('chat-background--dimmed');
    expect(background).not.toHaveAttribute('data-dimmed');
  });

  it('fades the waves while a conversation is on screen, and brings them back for a new chat', () => {
    const { rerender } = render(<ChatBackground dimmed />);
    expect(screen.getByTestId('chat-background')).toHaveClass('chat-background--dimmed');
    rerender(<ChatBackground dimmed={false} />);
    expect(screen.getByTestId('chat-background')).not.toHaveClass('chat-background--dimmed');
  });
});
