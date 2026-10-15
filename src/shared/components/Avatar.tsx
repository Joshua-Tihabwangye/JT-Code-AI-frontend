import { forwardRef, useState, type HTMLAttributes } from 'react';
import { clsx } from 'clsx';

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  fallback?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

const sizes = {
  xs: 'h-6 w-6 text-xs',
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-base',
  lg: 'h-12 w-12 text-lg',
  xl: 'h-16 w-16 text-xl',
};

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, alt, fallback, size = 'md', ...props }, ref) => {
    const [imageError, setImageError] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);

    if (!src || imageError) {
      const initials = fallback?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
      return (
        <div
          ref={ref}
          className={clsx(
            'inline-flex items-center justify-center rounded-full bg-primary font-medium text-primary-foreground',
            'shadow-sm ring-1 ring-black/5 dark:ring-white/10',
            'transition-transform duration-150',
            sizes[size],
            className
          )}
          {...props}
        >
          {initials}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={clsx(
          'relative inline-flex shrink-0 overflow-hidden rounded-full bg-muted',
          'shadow-sm ring-1 ring-black/5 dark:ring-white/10',
          sizes[size],
          className
        )}
        {...props}
      >
        <img
          src={src}
          alt={alt || fallback || 'Avatar'}
          className={clsx(
            'aspect-square h-full w-full object-cover',
            'transition-opacity duration-300',
            imageLoaded ? 'opacity-100' : 'opacity-0'
          )}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
        />
        {!imageLoaded && (
          <div className="absolute inset-0 animate-pulse bg-muted" />
        )}
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';

export const AvatarImage = forwardRef<HTMLImageElement, { src?: string; alt?: string; className?: string }>(
  ({ className, src, alt, ...props }, ref) => (
    <img
      ref={ref}
      src={src}
      alt={alt}
      className={clsx('aspect-square h-full w-full object-cover', className)}
      {...props}
    />
  )
);
AvatarImage.displayName = 'AvatarImage';

export const AvatarFallback = forwardRef<HTMLDivElement, { children?: React.ReactNode; className?: string }>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={clsx(
        'flex h-full w-full items-center justify-center rounded-full bg-primary font-medium text-primary-foreground',
        'shadow-sm ring-1 ring-black/5 dark:ring-white/10',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
AvatarFallback.displayName = 'AvatarFallback';