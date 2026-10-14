import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AccountMenu } from './AccountMenu';

// Mock the supabase and auth hooks
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signOut: vi.fn() } },
  useAuth: () => ({ isSignedIn: false }),
  useUser: () => null,
}));

// Mock react-i18next
vi.mock('@/lib/data/useAccount', () => ({
  useAccount: () => ({ data: undefined }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'menu.signIn': 'Sign in',
        'menu.account': 'Account',
        'menu.settings': 'Settings',
        'menu.keyboardShortcuts': 'Keyboard shortcuts',
        'menu.signOut': 'Sign out',
      };
      return translations[key] ?? key;
    },
  }),
}));

function renderWithRouter(ui: React.ReactNode) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe('AccountMenu', () => {
  it('renders the account button for guest users', () => {
    renderWithRouter(<AccountMenu collapsed={false} />);
    expect(screen.getByRole('button', { name: /Sign in/i })).toBeInTheDocument();
  });

  it('applies correct class to popover when not collapsed', () => {
    renderWithRouter(<AccountMenu collapsed={false} />);
    const button = screen.getByRole('button', { name: /Sign in/i });
    fireEvent.click(button);
    const popover = screen.getByRole('menu');
    expect(popover).toHaveClass('account-popover');
    expect(popover).not.toHaveClass('collapsed');
  });

  it('opens menu on click and shows Sign in menuitem', () => {
    renderWithRouter(<AccountMenu collapsed={false} />);
    const button = screen.getByRole('button', { name: /Sign in/i });
    fireEvent.click(button);
    expect(screen.getByRole('menuitem', { name: /Sign in/i })).toBeInTheDocument();
  });

  it('has correct aria attributes', () => {
    renderWithRouter(<AccountMenu collapsed={false} />);
    const button = screen.getByRole('button', { name: /Sign in/i });
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows popover with collapsed class when collapsed', () => {
    renderWithRouter(<AccountMenu collapsed />);
    const button = screen.getByRole('button', { name: /Sign in/i });
    fireEvent.click(button);
    const popover = screen.getByRole('menu');
    expect(popover).toHaveClass('collapsed');
  });
});
