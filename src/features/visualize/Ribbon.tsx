import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react';

export interface RibbonTab {
  id: string;
  label: string;
  icon?: LucideIcon;
}

/** A Word-style ribbon: tabs on top, grouped controls below, collapsible, sticky while scrolling. */
export function Ribbon({
  tabs,
  active,
  onChange,
  children,
  aside,
  testId,
}: {
  tabs: RibbonTab[];
  active: string;
  onChange: (id: string) => void;
  children: ReactNode;
  aside?: ReactNode;
  testId?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="viz-ribbon" data-testid={testId}>
      <div className="viz-ribbon-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            className="viz-ribbon-tab"
            onClick={() => {
              onChange(tab.id);
              setCollapsed(false);
            }}
            data-testid={`ribbon-${tab.id}`}
          >
            {tab.icon && <tab.icon size={14} aria-hidden />} {tab.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pr-1">
          {aside}
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground hover:bg-accent"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand ribbon' : 'Collapse ribbon'}
            title={collapsed ? 'Expand ribbon' : 'Collapse ribbon'}
          >
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
      </div>
      {!collapsed && <div className="viz-ribbon-body">{children}</div>}
    </div>
  );
}

/** A captioned group of ribbon controls, separated by a divider like Word's ribbon groups. */
export function RibbonGroup({ title, children, grow = false, pinned = false }: { title: string; children: ReactNode; grow?: boolean; pinned?: boolean }) {
  return (
    <div className={`viz-ribbon-group${grow ? ' grow' : ''}${pinned ? ' pinned' : ''}`} data-pinned={pinned || undefined}>
      <div className="viz-ribbon-controls">{children}</div>
      <div className="viz-ribbon-caption">{title}</div>
    </div>
  );
}

/** A compact labelled control for ribbons. */
export function RibbonField({ label, children, width }: { label: string; children: ReactNode; width?: number }) {
  return (
    <label className="viz-ribbon-field" style={width ? { width } : undefined}>
      <span>{label}</span>
      {children}
    </label>
  );
}
