import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SocialAuthButtons } from './SocialAuthButtons';

const auth = vi.hoisted(() => ({ fetchEnabledProviders: vi.fn() }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/supabase', () => auth);

describe('Social sign-in buttons', () => {
  beforeEach(() => auth.fetchEnabledProviders.mockReset());

  it('shows nothing, not even the divider, when Supabase Auth has no provider enabled', async () => {
    auth.fetchEnabledProviders.mockResolvedValue([]);
    const { container } = render(<SocialAuthButtons />);
    await vi.waitFor(() => expect(auth.fetchEnabledProviders).toHaveBeenCalled());
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('common.or')).toBeNull();
  });

  it('shows only the enabled provider and starts it on click', async () => {
    auth.fetchEnabledProviders.mockResolvedValue(['google']);
    const onGoogle = vi.fn();
    render(<SocialAuthButtons onGoogle={onGoogle} />);
    fireEvent.click(await screen.findByRole('button', { name: 'signin.signInWithGoogle' }));
    expect(onGoogle).toHaveBeenCalledOnce();
    expect(screen.getByText('common.or')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'signin.signInWithApple' })).toBeNull();
  });

  it('shows both when both are enabled', async () => {
    auth.fetchEnabledProviders.mockResolvedValue(['google', 'apple']);
    render(<SocialAuthButtons />);
    expect(await screen.findByRole('button', { name: 'signin.signInWithApple' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'signin.signInWithGoogle' })).toBeInTheDocument();
  });
});
