import { useState, useRef, useEffect, type HTMLAttributes } from 'react';
import { clsx } from 'clsx';

interface DropdownProps extends Omit<HTMLAttributes<HTMLDivElement>, 'content'> {
  trigger: React.ReactNode;
  content: React.ReactNode;
  align?: 'left' | 'right';
  above?: boolean;
  isOpen?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
}

export function Dropdown({
  trigger,
  content,
  align = 'right',
  above = false,
  isOpen: externalIsOpen,
  onOpen,
  onClose,
  className,
  ...props
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(externalIsOpen ?? false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        onClose?.();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) onOpen?.();
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className={clsx('relative inline-block', className)} {...props}>
      <div onClick={() => { setIsOpen((prev) => !prev); onOpen?.(); }}>{trigger}</div>
      {isOpen && (
        <div
          className={clsx(
            'absolute z-50 min-w-[180px] rounded-md border bg-popover p-1 text-popover-foreground',
            'shadow-lg ring-1 ring-black/5 dark:ring-white/10',
            'dropdown-enter',
            align === 'right' ? 'right-0' : 'left-0',
            above ? 'bottom-full -mt-2' : 'mt-2'
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({ className, onClick, children, ...props }: HTMLAttributes<HTMLButtonElement> & { onClick?: () => void }) {
  return (
    <button
      className={clsx(
        'flex w-full items-center rounded-sm px-3 py-1.5 text-sm outline-none',
        'transition-colors duration-100',
        'hover:bg-accent hover:text-accent-foreground',
        'focus:bg-accent focus:text-accent-foreground',
        'active:scale-[0.98]',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      onClick={() => { onClick?.(); }}
      {...props}
    >
      {children}
    </button>
  );
}

export function DropdownSeparator({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('-mx-1 my-1 h-px bg-border', className)} {...props} />;
}

export function DropdownLabel({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('px-3 py-1.5 text-sm font-medium text-muted-foreground', className)} {...props}>{children}</div>;
}
