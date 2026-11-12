import { useEffect, useRef, useState } from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { FloatingPanel } from '@/shared/components/FloatingPanel';
import { useLanguage } from './useLanguage';
import { getLanguage } from './languages';

interface LanguageMenuProps {
  collapsed?: boolean;
}

export function LanguageMenu({ collapsed = false }: LanguageMenuProps) {
  const { currentLanguage, setLanguage, languages } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const current = getLanguage(currentLanguage);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (ref.current && !ref.current.contains(target) && !popoverRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const choose = (code: string) => {
    setLanguage(code);
    setOpen(false);
  };

  return (
    <div className={`language-menu${collapsed ? ' language-menu--collapsed' : ''}`} ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        className="language-menu__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={current.nativeName}
        onClick={() => setOpen((value) => !value)}
      >
        <Globe size={18} aria-hidden />
        {!collapsed && <span className="language-menu__label">{current.nativeName}</span>}
        {!collapsed && <ChevronDown size={14} aria-hidden className="language-menu__chev" />}
      </button>

      {open && (
        <FloatingPanel
          anchorRef={triggerRef}
          placement={collapsed ? 'side-down' : 'below'}
          edgeSelector=".sidebar"
          width={collapsed ? 230 : 0}
          panelRef={popoverRef}
          className={`language-menu__popover${collapsed ? ' language-menu__popover--collapsed' : ''}`}
          role="listbox"
        >
          {languages.map((language) => {
            const active = language.code === currentLanguage;
            return (
              <button
                key={language.code}
                type="button"
                role="option"
                aria-selected={active}
                className={`language-menu__option${active ? ' is-active' : ''}`}
                onClick={() => choose(language.code)}
              >
                <span className="language-menu__option-label">{language.nativeName}</span>
                <span className="language-menu__option-sub">{language.englishName}</span>
                {active && <Check size={16} aria-hidden className="language-menu__check" />}
              </button>
            );
          })}
        </FloatingPanel>
      )}
    </div>
  );
}
