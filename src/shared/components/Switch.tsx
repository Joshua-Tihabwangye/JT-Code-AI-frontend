import { forwardRef, type HTMLAttributes } from 'react';
import { clsx } from 'clsx';

interface SwitchProps extends HTMLAttributes<HTMLButtonElement> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, onCheckedChange, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={clsx(
        'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full border-2',
        'transition-all duration-200 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked
          ? 'border-transparent bg-primary hover:bg-primary/90 shadow-sm'
          : 'border-border bg-muted hover:border-ring/40',
        className
      )}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange(!checked)}
      {...props}
    >
      <span
        className={clsx(
          'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background',
          'shadow-md ring-1 ring-black/5 dark:ring-white/10',
          'transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
          checked ? 'translate-x-5' : 'translate-x-0'
        )}
      />
    </button>
  )
);
Switch.displayName = 'Switch';