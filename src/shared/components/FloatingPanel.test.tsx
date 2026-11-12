import { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FloatingPanel, type FloatingPlacement } from './FloatingPanel';

function Harness({ placement }: { placement: FloatingPlacement }) {
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <aside style={{ overflow: 'hidden', width: 72 }} data-testid="sidebar">
      <button ref={anchor} type="button">
        Open
      </button>
      <FloatingPanel anchorRef={anchor} placement={placement} width={256} role="menu" data-testid="panel">
        Menu
      </FloatingPanel>
    </aside>
  );
}

describe('FloatingPanel', () => {
  const rect = (box: Partial<DOMRect>) => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}), ...box });
  // eslint-disable-next-line @typescript-eslint/unbound-method -- restored as is, never called detached
  const original = HTMLElement.prototype.getBoundingClientRect;
  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = original;
    document.documentElement.dir = 'ltr';
  });

  it('renders on top of the page, outside the (clipping) sidebar', () => {
    HTMLElement.prototype.getBoundingClientRect = () => rect({ left: 8, right: 64, top: 700, bottom: 740, width: 56, height: 40 });
    render(<Harness placement="side-up" />);
    const panel = screen.getByTestId('panel');
    expect(screen.getByTestId('sidebar').contains(panel)).toBe(false);
    expect(panel.parentElement).toBe(document.body);
    expect(panel).toHaveClass('floating-panel');
  });

  it('opens beside a collapsed sidebar, growing upward from the trigger', () => {
    HTMLElement.prototype.getBoundingClientRect = () => rect({ left: 8, right: 64, top: 700, bottom: 740, width: 56, height: 40 });
    render(<Harness placement="side-up" />);
    const panel = screen.getByTestId('panel');
    expect(panel.style.left).toBe('72px');
    expect(panel.style.bottom).toBe(`${window.innerHeight - 740}px`);
    expect(panel.style.width).toBe('256px');
  });

  it('opens on the other side in right-to-left languages', () => {
    document.documentElement.dir = 'rtl';
    HTMLElement.prototype.getBoundingClientRect = () => rect({ left: 900, right: 960, top: 100, bottom: 140, width: 60, height: 40 });
    render(<Harness placement="side-down" />);
    expect(screen.getByTestId('panel').style.left).toBe(`${900 - 8 - 256}px`);
  });

  it('stays inside the screen', () => {
    HTMLElement.prototype.getBoundingClientRect = () => rect({ left: window.innerWidth - 20, right: window.innerWidth - 4, top: 10, bottom: 30, width: 16, height: 20 });
    render(<Harness placement="side-down" />);
    const left = parseFloat(screen.getByTestId('panel').style.left);
    expect(left + 256).toBeLessThanOrEqual(window.innerWidth - 8);
  });
});
