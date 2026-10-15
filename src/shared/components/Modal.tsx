import { forwardRef, useEffect, useId, useRef, type HTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { X } from 'lucide-react';

export interface ModalProps extends HTMLAttributes<HTMLDivElement> {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  hideCloseButton?: boolean;
}

export const Modal = forwardRef<HTMLDivElement, ModalProps>(
  ({ className, isOpen, onClose, title, description, size = 'md', hideCloseButton, children, ...props }, ref) => {
    const contentRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    const id = useId();
    const titleId = `modal-title-${id}`;
    const descriptionId = `modal-description-${id}`;

    useEffect(() => {
      onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
      if (!isOpen) return;
      const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const content = contentRef.current;
      const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const firstFocusable = content?.querySelector<HTMLElement>(focusableSelector);
      (firstFocusable ?? content)?.focus();

      function handleKeyDown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCloseRef.current();
          return;
        }
        if (event.key !== 'Tab' || !content) return;
        const focusable = Array.from(content.querySelectorAll<HTMLElement>(focusableSelector));
        if (focusable.length === 0) {
          event.preventDefault();
          content.focus();
          return;
        }
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        const focusOutsideDialog = !content.contains(document.activeElement);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === content || focusOutsideDialog)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === content || focusOutsideDialog)) {
          event.preventDefault();
          first.focus();
        }
      }

      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        if (previouslyFocused?.isConnected) previouslyFocused.focus();
      };
    }, [isOpen]);

    if (!isOpen) return null;

    const sizes = {
      sm: 'max-w-sm',
      md: 'max-w-lg',
      lg: 'max-w-2xl',
      xl: 'max-w-4xl',
      full: 'max-w-[90vw]',
    };

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm backdrop-in"
            onClick={onClose}
            aria-hidden="true"
          />
          <div
            className={clsx(
              'relative w-full rounded-xl bg-background p-6',
              'shadow-2xl ring-1 ring-black/5 dark:ring-white/10',
              'modal-enter',
              sizes[size],
              className
            )}
            ref={(node) => {
              contentRef.current = node;
              if (typeof ref === 'function') ref(node);
              else if (ref) ref.current = node;
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            {...props}
          >
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground opacity-70 transition-all hover:opacity-100 hover:bg-muted hover:scale-105 active:scale-95"
              >
                <X size={18} />
              </button>
            )}
            {(title || description) && (
              <div className="mb-4 pr-8">
                {title && (
                  <h2 id={titleId} className="text-lg font-semibold">
                    {title}
                  </h2>
                )}
                {description && (
                  <p id={descriptionId} className="mt-1 text-sm text-muted-foreground leading-relaxed">
                    {description}
                  </p>
                )}
              </div>
            )}
            {children}
          </div>
        </div>
      </div>
    );
  }
);
Modal.displayName = 'Modal';
