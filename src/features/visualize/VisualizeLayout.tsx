import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, BrainCircuit, Database, FileText, Home, LayoutDashboard, LayoutGrid, Shapes, Sparkles, Wand2 } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/http';
import { AssistantPanel } from './AssistantPanel';
import { VisualizeProvider, useVisualize } from './context';
import './visualize.css';

const TABS = [
  { to: '/app/visualize', end: true, key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/app/visualize/dashboards', key: 'dashboards', label: 'Dashboards', icon: LayoutGrid },
  { to: '/app/visualize/data', key: 'data', label: 'Data', icon: Database },
  { to: '/app/visualize/gallery', key: 'gallery', label: 'Chart gallery', icon: Shapes },
  { to: '/app/visualize/studio', key: 'studio', label: 'Studio', icon: Wand2 },
  { to: '/app/visualize/predict', key: 'predict', label: 'Predict', icon: BrainCircuit },
  { to: '/app/visualize/reports', key: 'reports', label: 'My visuals', icon: FileText },
];

function Shell() {
  const { t } = useTranslation();
  const { catalogError, assistantOpen, setAssistantOpen } = useVisualize();
  const navigate = useNavigate();
  const location = useLocation();
  // The overview and an open dashboard have their own headers, so the module bar is hidden there
  // (a dashboard gets the whole screen).
  const path = location.pathname.replace(/\/+$/, '');
  const isHome = path === '/app/visualize' || /^\/app\/visualize\/dashboards\/[^/]+(\/edit)?$/.test(path);
  return (
    <div className="viz" data-testid="visualize-tool">
      {!isHome && (
        <header className="viz-header" data-testid="viz-header">
          <button
            type="button"
            className="viz-icon-button"
            onClick={() => (window.history.length > 1 && location.key !== 'default' ? void navigate(-1) : void navigate('/app/visualize'))}
            aria-label={t('visualize.back', 'Back')}
            title={t('visualize.back', 'Back')}
            data-testid="viz-back"
          >
            <ArrowLeft size={16} aria-hidden />
          </button>
          <button type="button" className="viz-icon-button" onClick={() => void navigate('/app/visualize')} title="Visualization home" data-testid="viz-home">
            <Home size={16} aria-hidden /> {t('visualize.home', 'Home')}
          </button>
          <nav className="viz-nav" aria-label={t('visualize.sections', 'Data visualization sections')}>
            {TABS.map((tab) => (
              <NavLink key={tab.key} to={tab.to} end={tab.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                <tab.icon size={15} aria-hidden /> {t(`visualize.tabs.${tab.key}`, tab.label)}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            className="viz-fab ml-auto"
            style={{ position: 'static' }}
            onClick={() => setAssistantOpen(true)}
            aria-expanded={assistantOpen}
            data-testid="open-assistant"
          >
            <Sparkles size={16} aria-hidden /> {t('visualize.askAi', 'Ask JT-Code AI')}
          </button>
        </header>
      )}
      {catalogError ? (
        <p role="alert" className="viz-card viz-card-pad text-sm text-destructive">
          {apiErrorMessage(catalogError)}
        </p>
      ) : null}
      <Outlet />
      {assistantOpen && (
        <>
          <div className="viz-drawer-backdrop" onClick={() => setAssistantOpen(false)} aria-hidden />
          <AssistantPanel onClose={() => setAssistantOpen(false)} />
        </>
      )}
    </div>
  );
}

/** The Data Visualization tool: a multi-page workspace behind the sidebar's “Data Visualization” door. */
export function VisualizeLayout() {
  return (
    <VisualizeProvider>
      <Shell />
    </VisualizeProvider>
  );
}
