import { forwardRef, type HTMLAttributes } from 'react';
import { clsx } from 'clsx';

export interface SeparatorProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
  decorative?: boolean;
  fade?: boolean;
}

export const Separator = forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className, orientation = 'horizontal', decorative = true, fade = false, style, ...props }, ref) => (
    <div
      ref={ref}
      className={clsx(
        'shrink-0',
        !fade && 'bg-border',
        orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
        className
      )}
      style={
        fade
          ? {
              background: `linear-gradient(${
                orientation === 'horizontal' ? '90deg' : '180deg'
              }, transparent, var(--border), transparent)`,
              ...style,
            }
          : style
      }
      role={decorative ? 'none' : 'separator'}
      aria-orientation={orientation}
      {...props}
    />
  )
);
Separator.displayName = 'Separator';