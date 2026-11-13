import { useLayoutEffect, useState, type CSSProperties, type HTMLAttributes, type Ref, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/**
 * Where the panel opens relative to its trigger:
 * - `above`: over the trigger, at least as wide as it (expanded sidebar footer menus);
 * - `below`: under the trigger (expanded sidebar header menus);
 * - `side-up`: beside the trigger, bottom edges aligned, growing upward (collapsed sidebar footer);
 * - `side-down`: beside the trigger, top edges aligned, growing downward (collapsed sidebar header).
 * "Beside" is the inline end: to the right, or to the left in right-to-left languages.
 */
export type FloatingPlacement = 'above' | 'below' | 'side-up' | 'side-down';

const GAP = 8;
const MARGIN = 8;

function position(anchor: DOMRect, placement: FloatingPlacement, width: number, edge?: DOMRect): CSSProperties {
  const rtl = document.documentElement.dir === 'rtl';
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const clampLeft = (left: number) => Math.max(MARGIN, Math.min(left, viewportWidth - width - MARGIN));
  if (placement === 'side-up' || placement === 'side-down') {
    // Beside the container's edge (the sidebar), not just the trigger, so nothing overlaps it.
    const left = rtl ? (edge?.left ?? anchor.left) - GAP - width : (edge?.right ?? anchor.right) + GAP;
    const style: CSSProperties = { left: clampLeft(left), width };
    if (placement === 'side-up') {
      style.bottom = Math.max(MARGIN, viewportHeight - anchor.bottom);
      style.maxHeight = anchor.bottom - MARGIN;
    } else {
      style.top = Math.max(MARGIN, anchor.top);
      style.maxHeight = viewportHeight - Math.max(MARGIN, anchor.top) - MARGIN;
    }
    return style;
  }
  const panelWidth = Math.max(width, anchor.width);
  const left = clampLeft(rtl ? anchor.right - panelWidth : anchor.left);
  if (placement === 'above') {
    return { left, width: panelWidth, bottom: viewportHeight - anchor.top + GAP / 2, maxHeight: anchor.top - GAP - MARGIN };
  }
  return { left, width: panelWidth, top: anchor.bottom + GAP / 2, maxHeight: viewportHeight - anchor.bottom - GAP - MARGIN };
}

/** A popover rendered on top of the page (in `document.body`), placed next to its trigger. It is
 *  never clipped by a scrolling or narrow container such as the collapsed sidebar. */
export function FloatingPanel({
  anchorRef,
  placement,
  width = 256,
  panelRef,
  edgeSelector,
  className = '',
  style,
  hidden = false,
  children,
  ...rest
}: {
  anchorRef: RefObject<HTMLElement | null>;
  placement: FloatingPlacement;
  width?: number;
  panelRef?: Ref<HTMLDivElement>;
  /** Side placements: open beside the nearest ancestor matching this selector (e.g. `.sidebar`). */
  edgeSelector?: string;
  /** Kept mounted but not shown (e.g. a menu holding a file input); placed again when shown. */
  hidden?: boolean;
} & HTMLAttributes<HTMLDivElement>) {
  const [box, setBox] = useState<CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (hidden) return;
    const update = () => {
      const element = anchorRef.current;
      const anchor = element?.getBoundingClientRect();
      const edge = edgeSelector ? element?.closest(edgeSelector)?.getBoundingClientRect() : undefined;
      if (anchor) setBox(position(anchor, placement, width, edge));
    };
    update();
    window.addEventListener('resize', update);
    // Capture: the sidebar (or any ancestor) scrolling moves the trigger too.
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorRef, placement, width, edgeSelector, hidden]);
  // Rendered at once (transparent until measured) so the menu can take keyboard focus as it opens.
  const placed = box ?? { left: 0, top: 0, opacity: 0 };
  return createPortal(
    <div ref={panelRef} className={`floating-panel ${className}`} style={{ ...placed, ...style }} data-placement={placement} hidden={hidden} {...rest}>
      {children}
    </div>,
    document.body,
  );
}
