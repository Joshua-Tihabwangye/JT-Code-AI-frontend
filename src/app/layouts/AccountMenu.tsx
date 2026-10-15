import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Settings, LogOut, Keyboard, User as UserIcon, LogIn, type LucideIcon } from 'lucide-react';
import { Avatar, Badge } from '@/shared/components';
import { supabase, useAuth, useUser } from '@/lib/supabase';
import { useAccount } from '@/lib/data/useAccount';

interface AccountMenuProps {
  collapsed: boolean;
}

export function AccountMenu({ collapsed }: AccountMenuProps) {
  const user = useUser();
  const { isSignedIn } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // The API profile is the source of truth (Settings edits it); Supabase metadata covers first paint.
  const account = useAccount().data;
  const accountName = `${account?.firstName ?? ''} ${account?.lastName ?? ''}`.trim();
  const displayName =
    accountName ||
    String(user?.user_metadata?.full_name ?? '') ||
    String(user?.user_metadata?.name ?? '') ||
    user?.email ||
    t('menu.account');
  const email = account?.email ?? user?.email ?? '';
  const avatarUrl = account?.avatarUrl ?? undefined;
  const planSlug = account?.plan ?? 'free';
  const plan = planSlug.charAt(0).toUpperCase() + planSlug.slice(1);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (
        !menuRef.current?.contains(event.target as Node) &&
        !buttonRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  useEffect(() => {
    if (open) {
      const first = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
      first?.focus();
    }
  }, [open]);

  const closeAnd = (action: () => void | Promise<void>) => () => {
    setOpen(false);
    buttonRef.current?.focus();
    void action();
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1]?.focus();
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    void navigate('/sign-in');
  };

  // Public, unauthenticated state: a neutral person icon that opens a compact
  // menu to sign in / create an account. No initials, no fabricated avatar.
  if (!isSignedIn || !user) {
    const guestItems: { label: string; icon: LucideIcon; onClick: () => void }[] = [
      { label: t('menu.signIn'), icon: LogIn, onClick: closeAnd(() => navigate('/sign-in')) },
    ];

    return (
      <div className="account-menu-root">
        <button
          ref={buttonRef}
          type="button"
          className="account-row"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          title={collapsed ? t('menu.signIn') : undefined}
          onClick={() => setOpen((prev) => !prev)}
        >
          <UserIcon size={18} className="text-muted-foreground" aria-hidden />
          {!collapsed && <span className="footer-label">{t('menu.signIn')}</span>}
        </button>

        {open && (
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={t('menu.account')}
            className={`account-popover ${collapsed ? 'collapsed' : ''}`}
            onKeyDown={onMenuKeyDown}
          >
            {guestItems.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className="account-popover-item"
                onClick={item.onClick}
              >
                <item.icon size={16} aria-hidden />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const items: { label: string; icon: LucideIcon; onClick: () => void }[] = [
    { label: t('menu.settings'), icon: Settings, onClick: closeAnd(() => navigate('/app/settings')) },
    {
      label: t('menu.keyboardShortcuts'),
      icon: Keyboard,
      onClick: closeAnd(() => navigate('/app/settings')),
    },
  ];

  return (
    <div className="account-menu-root">
      <button
        ref={buttonRef}
        type="button"
        className="account-row"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={collapsed ? displayName : undefined}
        onClick={() => setOpen((prev) => !prev)}
      >
        {avatarUrl ? <Avatar src={avatarUrl} alt={displayName} size="sm" /> : <UserIcon size={18} className="text-muted-foreground" aria-hidden />}
        {!collapsed && <span className="footer-label truncate">{displayName}</span>}
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={t('menu.account')}
          className={`account-popover ${collapsed ? 'collapsed' : ''}`}
          onKeyDown={onMenuKeyDown}
        >
          <div className="account-popover-header">
            {avatarUrl ? <Avatar src={avatarUrl} alt={displayName} size="md" /> : <UserIcon size={18} className="text-muted-foreground" aria-hidden />}
            <div className="min-w-0">
              <div className="account-popover-name">{displayName}</div>
              <div className="account-popover-email">{email}</div>
            </div>
            <Badge variant="secondary" className="account-plan-badge">
              {plan}
            </Badge>
          </div>
          <div className="account-popover-separator" />
          {items.map((item) => (
            <button key={item.label} type="button" role="menuitem" className="account-popover-item" onClick={item.onClick}>
              <item.icon size={16} aria-hidden />
              <span>{item.label}</span>
            </button>
          ))}
          <div className="account-popover-separator" />
          <button
            type="button"
            role="menuitem"
            className="account-popover-item danger"
            onClick={closeAnd(() => signOut())}
          >
            <LogOut size={16} aria-hidden />
            <span>{t('menu.signOut')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
