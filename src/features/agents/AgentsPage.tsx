import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { config } from '@/lib/config';
import { Alert, Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components';
import { AgentsTab } from '@/features/agents/AgentsTab';
import { AutomationsTab } from '@/features/agents/AutomationsTab';
import { ToolsTab } from '@/features/agents/ToolsTab';

/** /app/agents: agents (define, run, follow) and scheduled automations. */
export function AgentsPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (['automations', 'tools'] as const).find((name) => name === searchParams.get('tab')) ?? 'agents';
  return (
    <section className="workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{t('agents.eyebrow')}</p>
          <h1>{t('agents.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('agents.subtitle')}</p>
        </div>
      </header>
      {config.dataMode === 'mock' && <Alert className="mb-6">{t('agents.errors.demo')}</Alert>}
      <Tabs value={tab} onValueChange={(next) => setSearchParams(next === 'agents' ? {} : { tab: next }, { replace: true })}>
        <TabsList className="mb-6" aria-label={t('agents.title')}>
          <TabsTrigger value="agents">{t('agents.tabAgents')}</TabsTrigger>
          <TabsTrigger value="automations">{t('agents.tabAutomations')}</TabsTrigger>
          <TabsTrigger value="tools">{t('agents.tabTools')}</TabsTrigger>
        </TabsList>
        <TabsContent value="agents" className="max-w-5xl mx-auto">
          <AgentsTab />
        </TabsContent>
        <TabsContent value="automations" className="max-w-5xl mx-auto">
          <AutomationsTab />
        </TabsContent>
        <TabsContent value="tools" className="max-w-5xl mx-auto">
          <ToolsTab />
        </TabsContent>
      </Tabs>
    </section>
  );
}
