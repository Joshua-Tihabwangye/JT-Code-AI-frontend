import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BrainCircuit, Compass, Database, FileText, FolderCog, LayoutGrid, Shapes, Sparkles } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/http';
import { AssistantPanel } from './AssistantPanel';
import { PythonLibraries } from './PythonLibraries';
import { DatasetsDialog } from './DatasetsDialog';
import { VisualizeProvider, useVisualize } from './context';
import './visualize.css';

const TABS = [
  { to: '/app/visualize', match: /^\/app\/visualize(\/dashboards)?$/, key: 'dashboards', icon: LayoutGrid },
  { to: '/app/visualize/data', key: 'data', icon: Database },
  { to: '/app/visualize/explore', key: 'explore', icon: Compass },
  { to: '/app/visualize/predict', key: 'predict', icon: BrainCircuit },
  { to: '/app/visualize/gallery', key: 'gallery', icon: Shapes },
  { to: '/app/visualize/reports', key: 'reports', icon: FileText },
];

/** One module bar: the active dataset, the sections, and Ask AI (hidden inside a dashboard). */
function Shell() {
  const { t } = useTranslation();
  const { catalogError, assistantOpen, setAssistantOpen, datasets, datasetId, setDatasetId } = useVisualize();
  const [managing, setManaging] = useState(false);
  const location = useLocation();
  const path = location.pathname.replace(/\/+$/, '');
  // An open dashboard (view or edit) gets the whole screen and its own header.
  const inDashboard = /^\/app\/visualize\/dashboards\/[^/]+(\/edit)?$/.test(path);
  return (
    <div className="viz" data-testid="visualize-tool">
      {!inDashboard && (
        <header className="viz-header" data-testid="viz-header">
          <label className="viz-dataset-pick" title={t('visualize.dataset')}>
            <Database size={14} aria-hidden />
            <select value={datasetId} onChange={(event) => setDatasetId(event.target.value)} aria-label={t('visualize.dataset')} data-testid="module-dataset">
              {!datasets.length && <option value="">{t('visualize.noDataset')}</option>}
              {datasets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="viz-chip" onClick={() => setManaging(true)} disabled={!datasets.length} title={t('visualize.datasets.title')} data-testid="manage-datasets">
            <FolderCog size={14} aria-hidden /> {t('visualize.datasets.manage')}
          </button>
          <nav className="viz-nav" aria-label={t('visualize.sections')}>
            {TABS.map((tab) => (
              <NavLink key={tab.key} to={tab.to} end={!tab.match} className={({ isActive }) => ((tab.match ? tab.match.test(path) : isActive) ? 'active' : '')} data-testid={`tab-${tab.key}`}>
                <tab.icon size={15} aria-hidden /> {t(`visualize.tabs.${tab.key}`)}
              </NavLink>
            ))}
          </nav>
          <button type="button" className="viz-fab ml-auto" style={{ position: 'static' }} onClick={() => setAssistantOpen(true)} aria-expanded={assistantOpen} data-testid="open-assistant">
            <Sparkles size={16} aria-hidden /> {t('visualize.askAi')}
          </button>
        </header>
      )}
      {!inDashboard && <PythonLibraries page={TABS.find((tab) => (tab.match ? tab.match.test(path) : path === tab.to || path.startsWith(`${tab.to}/`)))?.key ?? 'dashboards'} />}
      {catalogError ? (
        <p role="alert" className="viz-card viz-card-pad text-sm text-destructive">
          {apiErrorMessage(catalogError)}
        </p>
      ) : null}
      <Outlet />
      <DatasetsDialog open={managing} onClose={() => setManaging(false)} />
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
