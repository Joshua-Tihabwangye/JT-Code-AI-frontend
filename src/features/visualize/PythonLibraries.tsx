import { useTranslation } from 'react-i18next';
import { Cpu } from 'lucide-react';
import { useVisualize } from './context';

/** The Python libraries that do the work on this page, with their versions (from the server). */
export function PythonLibraries({ page }: { page: string }) {
  const { t } = useTranslation();
  const { catalog } = useVisualize();
  const libraries = catalog?.libraries?.[page] ?? [];
  if (!libraries.length) return null;
  return (
    <div className="viz-libraries" data-testid={`python-libraries-${page}`}>
      <span className="viz-libraries-title">
        <Cpu size={13} aria-hidden /> {t('visualize.libraries.title')}
      </span>
      {libraries.map((library) => {
        const role = t(`visualize.libraries.roles.${page}.${library.id}`, { defaultValue: library.role });
        return (
          <span key={library.id} className="viz-library" title={role}>
            <b>{library.name}</b>
            {library.version && <span className="viz-library-version">{library.version}</span>}
            <span className="sr-only">: {role}</span>
          </span>
        );
      })}
    </div>
  );
}
