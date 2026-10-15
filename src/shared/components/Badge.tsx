import { forwardRef, type HTMLAttributes } from 'react';
import { clsx } from 'clsx';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    const variants = {
      default: 'border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-primary/85',
      secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
      destructive: 'border-transparent bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/85',
      outline: 'border-border text-foreground hover:bg-muted/50',
      success: 'border-transparent bg-success text-success-foreground shadow-sm hover:bg-success/85',
      warning: 'border-transparent bg-warning text-warning-foreground shadow-sm hover:bg-warning/85',
    };

    return (
      <span
        ref={ref}
        className={clsx(
          'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
          'transition-all duration-150 ease-out',
          'hover:scale-105 active:scale-95',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Badge.displayName = 'Badge';
