import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Play, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AUTOMATION_ACTIONS, useRepository, type AutomationAction, type NewAutomation } from '@/lib/data';
import { apiErrorMessage } from '@/lib/api/http';
import { formatDateTime } from '@/i18n/format';
import { plausibleCron, SCHEDULE_PRESETS, type SchedulePreset } from '@/features/agents/agents';
import { Alert, Badge, Button, Input, Select, Spinner, Textarea, useConfirm } from '@/shared/components';

/** Agents → Automations: scheduled e-mails to members, Slack messages or signed webhooks. */
export function AutomationsTab() {
  const { t } = useTranslation();
  const { confirm, dialog } = useConfirm();
  const automations = useRepository('automations');
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [preset, setPreset] = useState<SchedulePreset>('daily');
  const [cron, setCron] = useState('');
  const [action, setAction] = useState<AutomationAction>('email');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [channel, setChannel] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const list = useQuery({ queryKey: ['automations'], queryFn: () => automations.list() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['automations'] });
  const fail = (err: unknown) => {
    setSuccess('');
    // 403 on create: the server has no scheduled-automation workflow (n8n) configured.
    const status = (err as { response?: { status?: number } }).response?.status;
    setError(status === 403 ? t('automations.unavailable') : apiErrorMessage(err));
  };
  const schedule = preset === 'custom' ? cron.trim() : SCHEDULE_PRESETS[preset];

  function input(): NewAutomation['input'] {
    if (action === 'email') {
      const recipients = to.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);
      return { action, to: recipients, subject: subject.trim(), text: text.trim() };
    }
    if (action === 'slack_message') return { action, channel: channel.trim(), text: text.trim() };
    return { action, url: url.trim(), payload: {} };
  }

  const create = useMutation({
    mutationFn: () => automations.create({ name: name.trim(), schedule, input: input() }),
    onSuccess: async () => {
      setShowForm(false);
      setName('');
      setText('');
      setSubject('');
      setTo('');
      setError('');
      setSuccess(t('automations.created'));
      await refresh();
    },
    onError: fail,
  });
  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => automations.setActive(id, isActive),
    onSuccess: refresh,
    onError: fail,
  });
  const runNow = useMutation({
    mutationFn: (id: string) => automations.runNow(id),
    onSuccess: async () => {
      setError('');
      setSuccess(t('automations.started'));
      await refresh();
    },
    onError: fail,
  });
  const remove = useMutation({ mutationFn: (id: string) => automations.remove(id), onSuccess: refresh, onError: fail });

  const scheduleValid = preset !== 'custom' || plausibleCron(cron);
  const complete =
    name.trim() &&
    scheduleValid &&
    (action === 'webhook' ? /^https:\/\//.test(url.trim()) : text.trim()) &&
    (action !== 'email' || (to.trim() && subject.trim())) &&
    (action !== 'slack_message' || channel.trim());

  function submit(event: FormEvent) {
    event.preventDefault();
    if (complete) create.mutate();
  }

  return (
    <div className="space-y-6" data-testid="automations-tab">
      {error && (
        <Alert variant="destructive" onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('automations.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('automations.desc')}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => setShowForm(!showForm)} aria-expanded={showForm} data-testid="automation-new">
          <Plus size={16} aria-hidden="true" />
          {t('automations.new')}
        </Button>
      </div>

      {showForm && (
        <form className="space-y-3 rounded-lg border border-border p-4" onSubmit={submit} data-testid="automation-form">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label={t('automations.name')} required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
            <div>
              <label htmlFor="automation-schedule" className="mb-1.5 block text-sm font-medium text-foreground">
                {t('automations.schedule')}
              </label>
              <Select
                id="automation-schedule"
                value={preset}
                onChange={(e) => setPreset(e.target.value as SchedulePreset)}
                options={[...Object.keys(SCHEDULE_PRESETS), 'custom'].map((value) => ({ value, label: t(`automations.presets.${value}`) }))}
              />
            </div>
          </div>
          {preset === 'custom' && (
            <Input
              label={t('automations.cron')}
              placeholder="30 7 * * 1-5"
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              error={cron && !scheduleValid ? t('automations.cronHelp') : undefined}
            />
          )}
          <div className="max-w-xs">
            <label htmlFor="automation-action" className="mb-1.5 block text-sm font-medium text-foreground">
              {t('automations.action')}
            </label>
            <Select
              id="automation-action"
              value={action}
              onChange={(e) => setAction(e.target.value as AutomationAction)}
              options={AUTOMATION_ACTIONS.map((value) => ({ value, label: t(`automations.actions.${value}`) }))}
            />
          </div>
          {action === 'email' && (
            <>
              <Input label={t('automations.to')} value={to} onChange={(e) => setTo(e.target.value)} />
              <Input label={t('automations.subject')} maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />
            </>
          )}
          {action === 'slack_message' && <Input label={t('automations.channel')} placeholder="C0123456789" value={channel} onChange={(e) => setChannel(e.target.value)} />}
          {action === 'webhook' ? (
            <Input label={t('automations.url')} type="url" placeholder="https://example.com/hook" value={url} onChange={(e) => setUrl(e.target.value)} />
          ) : (
            <Textarea label={t('automations.text')} rows={3} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} />
          )}
          <Button type="submit" disabled={create.isPending || !complete} data-testid="automation-create">
            {create.isPending ? <Spinner size="sm" /> : <CalendarClock size={16} aria-hidden="true" />}
            {t('automations.create')}
          </Button>
        </form>
      )}

      {list.isPending ? (
        <Spinner size="sm" />
      ) : list.isError ? (
        <Alert variant="destructive">{apiErrorMessage(list.error)}</Alert>
      ) : list.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('automations.none')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border" data-testid="automations">
          {list.data.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 p-3">
              <CalendarClock size={16} className="text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                  <span className="truncate">{item.name}</span>
                  <Badge variant="outline">{t(`automations.actions.${item.input.action}`)}</Badge>
                  {!item.isActive && <Badge variant="outline">{t('automations.paused')}</Badge>}
                </div>
                <div className="text-sm text-muted-foreground">
                  {[
                    <code key="cron" className="text-xs">
                      {item.schedule}
                    </code>,
                    item.nextRunAt ? ` · ${t('automations.next', { date: formatDateTime(item.nextRunAt) })}` : '',
                    ` · ${t('automations.runs', { count: item.runCount })}`,
                  ]}
                </div>
                {item.lastError && <div className="text-sm text-destructive">{item.lastError}</div>}
              </div>
              <Button type="button" variant="outline" size="sm" disabled={runNow.isPending} onClick={() => runNow.mutate(item.id)}>
                <Play size={14} aria-hidden="true" />
                {t('automations.runNow')}
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={toggle.isPending} onClick={() => toggle.mutate({ id: item.id, isActive: !item.isActive })}>
                {item.isActive ? t('automations.pause') : t('automations.resume')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t('automations.deleteFor', { name: item.name })}
                disabled={remove.isPending}
                onClick={() =>
                  void confirm({
                    title: t('automations.deleteTitle'),
                    description: t('automations.deleteConfirm', { name: item.name }),
                    confirmLabel: t('automations.delete'),
                    destructive: true,
                  }).then((ok) => ok && remove.mutate(item.id))
                }
              >
                <Trash2 size={14} aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </div>
  );
}
