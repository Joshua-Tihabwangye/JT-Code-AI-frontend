import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  MessageSquare,
  Image as ImageIcon,
  History,
  CreditCard,
  ChartSpline,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeft,
  Menu,
  X,
} from 'lucide-react';
import { useAppStore } from '@/lib/appStore';
import { useTheme } from '@/lib/theme';
import { useAuth } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import { LanguageMenu } from '@/i18n/LanguageMenu';
import { AccountMenu } from '@/app/layouts/AccountMenu';

const publicNav = [
  { nameKey: 'chat', href: '/app/chat', icon: MessageSquare },
  { nameKey: 'images', href: '/app/images', icon: ImageIcon },
];

const authenticatedNav = [
  { nameKey: 'history', href: '/app/history', icon: History },
  { nameKey: 'visualize', href: '/app/visualize', icon: ChartSpline },
  { nameKey: 'billing', href: '/app/billing', icon: CreditCard },
];

type NavItem = { nameKey: string; href: string; icon: typeof MessageSquare };

function NavItems({ items, collapsed, onNavigate }: { items: NavItem[]; collapsed: boolean; onNavigate: () => void }) {
  const { t } = useTranslation();
  return items.map((item) => (
    <NavLink
      key={item.nameKey}
      to={item.href}
      title={collapsed ? t(`nav.${item.nameKey}`) : undefined}
      aria-label={collapsed ? t(`nav.${item.nameKey}`) : undefined}
      className={({ isActive }) => (isActive ? 'active' : '')}
      onClick={onNavigate}
    >
      <item.icon size={18} aria-hidden />
      {!collapsed && <span className="nav-label">{t(`nav.${item.nameKey}`)}</span>}
    </NavLink>
  ));
}

export function AppShell() {
  const { t } = useTranslation();
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const { resolvedTheme, toggleTheme } = useTheme();
  const { isSignedIn } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileHamburgerRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLDivElement>(null);

  const closeDrawer = useCallback(() => setMobileNavOpen(false), []);

  // Focus management for mobile drawer
  useEffect(() => {
    if (mobileNavOpen) {
      const first = mobileDrawerRef.current?.querySelector<HTMLElement>('[role="menuitem"], button, a, [tabindex="0"]');
      first?.focus();
    }
  }, [mobileNavOpen]);

  // Escape key closes mobile drawer
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileNavOpen(false);
        mobileHamburgerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileNavOpen]);

  // Lock body scroll when mobile drawer open
  useEffect(() => {
    if (mobileNavOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileNavOpen]);

  return (
    <div className={`app-shell ${collapsed ? 'collapsed' : ''} ${mobileNavOpen ? 'drawer-open' : ''}`}>
      {/* Always-visible mobile header — OUTSIDE the hidden drawer */}
      <header className="mobile-topbar" role="banner">
        <button
          ref={mobileHamburgerRef}
          type="button"
          className="mobile-hamburger"
          aria-label={mobileNavOpen ? t('chrome.closeNavigation', { defaultValue: 'Close navigation' }) : t('chrome.openNavigation')}
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen((prev) => !prev)}
        >
          {mobileNavOpen ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
        </button>
        <NavLink to="/app/chat" className="brand mobile-brand" aria-label="JT-Code home">
          <span className="brand-mark">JT</span>
          <span className="mobile-brand-name">JT-Code</span>
        </NavLink>
      </header>

      {/* Mobile backdrop */}
      {mobileNavOpen && (
        <div
          className="sidebar-backdrop"
          onClick={closeDrawer}
          aria-hidden
        />
      )}

      {/* Sidebar drawer */}
      <aside
        ref={mobileDrawerRef}
        className={`sidebar ${collapsed ? 'collapsed' : ''}`}
        aria-label="Primary navigation"
      >
        <div className="sidebar-logo-row">
          <NavLink to="/app/chat" className="brand" aria-label="JT-Code home" onClick={closeDrawer}>
            <span className="brand-mark">JT</span>
            {!collapsed && <span className="nav-label">JT-Code</span>}
          </NavLink>
        </div>

        <div className="sidebar-language">
          <LanguageMenu collapsed={collapsed} />
        </div>

        <nav className="nav-links compact" aria-label={t('nav.primary')}>
          <NavItems items={publicNav} collapsed={collapsed} onNavigate={closeDrawer} />
          {isSignedIn && <NavItems items={authenticatedNav} collapsed={collapsed} onNavigate={closeDrawer} />}
        </nav>

        <div className="sidebar-footer compact">
          <button type="button" onClick={toggleTheme} title={collapsed ? t('chrome.toggleTheme') : undefined} aria-label={t('chrome.toggleTheme')}>
            {resolvedTheme === 'dark' ? <Moon size={18} aria-hidden /> : <Sun size={18} aria-hidden />}
            {!collapsed && <span className="footer-label">{t('chrome.theme')}</span>}
          </button>

          <AccountMenu collapsed={collapsed} />

          <button type="button" onClick={toggleSidebar} title={collapsed ? t('chrome.expandSidebar') : t('chrome.collapseSidebar')} aria-label={collapsed ? t('chrome.expandSidebar') : t('chrome.collapseSidebar')}>
            {collapsed ? <PanelLeft size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
            {!collapsed && <span className="footer-label">{t('chrome.collapse')}</span>}
          </button>
        </div>
      </aside>

      <main className="main-content">
        <div className="page-scroll">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
