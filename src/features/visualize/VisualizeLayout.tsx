import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BrainCircuit, Compass, Database, FileText, LayoutGrid, Shapes, Sparkles } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/http';
import { AssistantPanel } from './AssistantPanel';
import { VisualizeProvider, useVisualize } from './context';
import './visualize.css';

const TABS = [
  { to: '/app/visualize', match: /^\/app\/visualize(\/dashboards)?$/, key: 'dashboards', label: 'Dashboards', icon: LayoutGrid },
  { to: '/app/visualize/data', key: 'data', label: 'Data', icon: Database },
  { to: '/app/visualize/explore', key: 'explore', label: 'Explore', icon: Compass },
  { to: '/app/visualize/predict', key: 'predict', label: 'Predict', icon: BrainCircuit },
  { to: '/app/visualize/gallery', key: 'gallery', label: 'Gallery', icon: Shapes },
  { to: '/app/visualize/reports', key: 'reports', label: 'Reports', icon: FileText },
];

/** One module bar: the active dataset, the sections, and Ask AI (hidden inside a dashboard). */
function Shell() {
  const { t } = useTranslation();
  const { catalogError, assistantOpen, setAssistantOpen, datasets, datasetId, setDatasetId } = useVisualize();
  const location = useLocation();
  const path = location.pathname.replace(/\/+$/, '');
  // An open dashboard (view or edit) gets the whole screen and its own header.
  const inDashboard = /^\/app\/visualize\/dashboards\/[^/]+(\/edit)?$/.test(path);
  return (
    <div className="viz" data-testid="visualize-tool">
      {!inDashboard && (
        <header className="viz-header" data-testid="viz-header">
          <label className="viz-dataset-pick" title={t('visualize.dataset', 'Dataset')}>
            <Database size={14} aria-hidden />
            <select value={datasetId} onChange={(event) => setDatasetId(event.target.value)} aria-label={t('visualize.dataset', 'Dataset')} data-testid="module-dataset">
              {!datasets.length && <option value="">{t('visualize.noDataset', 'No dataset yet')}</option>}
              {datasets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <nav className="viz-nav" aria-label={t('visualize.sections', 'Data visualization sections')}>
            {TABS.map((tab) => (
              <NavLink key={tab.key} to={tab.to} end={!tab.match} className={({ isActive }) => ((tab.match ? tab.match.test(path) : isActive) ? 'active' : '')} data-testid={`tab-${tab.key}`}>
                <tab.icon size={15} aria-hidden /> {t(`visualize.tabs.${tab.key}`, tab.label)}
              </NavLink>
            ))}
          </nav>
          <button type="button" className="viz-fab ml-auto" style={{ position: 'static' }} onClick={() => setAssistantOpen(true)} aria-expanded={assistantOpen} data-testid="open-assistant">
            <Sparkles size={16} aria-hidden /> {t('visualize.askAi', 'Ask AI')}
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
