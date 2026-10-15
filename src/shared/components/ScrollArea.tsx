import { forwardRef, type HTMLAttributes, useRef, useEffect, useState } from 'react';
import { clsx } from 'clsx';

interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  type?: 'auto' | 'always' | 'hover';
}

export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, type = 'auto', ...props }, ref) => {
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const scrollbarRef = useRef<HTMLDivElement>(null);
    const [isHovered, setIsHovered] = useState(false);
    const [scrollX, setScrollX] = useState(0);
    const [scrollY, setScrollY] = useState(0);

    useEffect(() => {
      const element = scrollAreaRef.current;
      if (!element) return;

      const handleScroll = () => {
        setScrollX(element.scrollLeft);
        setScrollY(element.scrollTop);
      };

      element.addEventListener('scroll', handleScroll);
      return () => element.removeEventListener('scroll', handleScroll);
    }, []);

    const showScrollbar = type === 'always' || (type === 'hover' && isHovered);

    return (
      <div
        ref={ref}
        className={clsx('relative overflow-hidden', className)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        {...props}
      >
        <div
          ref={scrollAreaRef}
          className="h-full w-full overflow-auto"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {children}
        </div>
        {showScrollbar && (
          <>
            <div
              ref={scrollbarRef}
              className={clsx(
                'absolute right-0 top-0 bottom-0 w-2.5 transition-opacity duration-200',
                'bg-transparent hover:bg-muted/40 rounded-l-full'
              )}
              style={{
                opacity: showScrollbar ? 1 : 0,
                pointerEvents: showScrollbar ? 'auto' : 'none',
              }}
            >
              <div
                className="absolute right-1 w-1.5 rounded-full bg-border transition-all duration-200 hover:bg-muted-foreground/60"
                style={{
                  top: scrollAreaRef.current
                    ? `${(scrollY / scrollAreaRef.current.scrollHeight) * 100}%`
                    : 0,
                  height: scrollAreaRef.current
                    ? `${(scrollAreaRef.current.clientHeight / scrollAreaRef.current.scrollHeight) * 100}%`
                    : 'auto',
                }}
              />
            </div>
            <div
              className={clsx(
                'absolute left-0 right-0 bottom-0 h-2.5 transition-opacity duration-200',
                'bg-transparent hover:bg-muted/40 rounded-t-full'
              )}
              style={{
                opacity: showScrollbar ? 1 : 0,
                pointerEvents: showScrollbar ? 'auto' : 'none',
              }}
            >
              <div
                className="absolute bottom-1 h-1.5 rounded-full bg-border transition-all duration-200 hover:bg-muted-foreground/60"
                style={{
                  left: scrollAreaRef.current
                    ? `${(scrollX / scrollAreaRef.current.scrollWidth) * 100}%`
                    : 0,
                  width: scrollAreaRef.current
                    ? `${(scrollAreaRef.current.clientWidth / scrollAreaRef.current.scrollWidth) * 100}%`
                    : 'auto',
                }}
              />
            </div>
          </>
        )}
      </div>
    );
  }
);
ScrollArea.displayName = 'ScrollArea';