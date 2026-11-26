import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Pause, Play, RefreshCw, Send, Trash2, Webhook as WebhookIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRepository, WEBHOOK_EVENTS, type CreatedWebhook, type Webhook, type WebhookEvent } from '@/lib/data';
import { apiErrorMessage } from '@/lib/api/http';
import { formatDate } from '@/i18n/format';
import { Alert, Badge, Button, Input, Spinner, useConfirm } from '@/shared/components';

/** Recent deliveries of one endpoint (newest first), refreshed while a delivery is still open. */
function Deliveries({ hook }: { hook: Webhook }) {
  const { t } = useTranslation();
  const webhooks = useRepository('webhooks');
  const deliveries = useQuery({
    queryKey: ['webhook-deliveries', hook.id],
    queryFn: () => webhooks.deliveries(hook.id),
    refetchInterval: (query) => (query.state.data?.some((item) => item.status === 'pending' || item.status === 'retrying') ? 3000 : false),
  });
  if (deliveries.isPending) return <Spinner size="sm" />;
  if (deliveries.isError) return <Alert variant="destructive">{apiErrorMessage(deliveries.error)}</Alert>;
  if (deliveries.data.length === 0) return <p className="text-sm text-muted-foreground">{t('webhooks.noDeliveries')}</p>;
  return (
    <ul className="space-y-1 text-sm" data-testid={`webhook-deliveries-${hook.id}`}>
      {deliveries.data.slice(0, 20).map((item) => (
        <li key={item.id} className="flex flex-wrap items-center gap-2">
          <Badge variant={item.status === 'delivered' ? 'secondary' : 'outline'}>{t(`webhooks.deliveryStatus.${item.status}`)}</Badge>
          <code className="text-xs">{item.eventType}</code>
          <span className="text-muted-foreground">
            {[
              formatDate(item.createdAt),
              t('webhooks.attempt', { attempt: item.attempt, max: item.maxAttempts }),
              item.responseStatus ? `HTTP ${item.responseStatus}` : '',
              item.errorMessage,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Settings → Developer → Webhooks: signed HTTPS callbacks for workspace events (admins only). */
export function WebhooksSection() {
  const { t } = useTranslation();
  const { confirm, dialog } = useConfirm();
  const webhooks = useRepository('webhooks');
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [allEvents, setAllEvents] = useState(true);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [secret, setSecret] = useState<CreatedWebhook | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState('');

  const hooks = useQuery({ queryKey: ['webhooks'], queryFn: () => webhooks.list(), retry: false });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['webhooks'] });
  const fail = (err: unknown) => setError(apiErrorMessage(err));
  const showSecret = (next: CreatedWebhook) => {
    setSecret(next);
    setCopied(false);
    setError('');
  };

  const create = useMutation({
    mutationFn: () => webhooks.create({ name: name.trim(), url: url.trim(), events: allEvents ? [] : events }),
    onSuccess: async (next) => {
      showSecret(next);
      setName('');
      setUrl('');
      setAllEvents(true);
      setEvents([]);
      await refresh();
    },
    onError: fail,
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'paused' }) => webhooks.setStatus(id, status),
    onSuccess: refresh,
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: string) => webhooks.remove(id),
    onSuccess: async (_result, id) => {
      if (secret?.id === id) setSecret(null);
      await refresh();
    },
    onError: fail,
  });
  const sendTest = useMutation({
    mutationFn: (id: string) => webhooks.sendTest(id),
    onSuccess: async (_delivery, id) => {
      setOpen(id);
      await queryClient.invalidateQueries({ queryKey: ['webhook-deliveries', id] });
    },
    onError: fail,
  });
  const rotate = useMutation({
    mutationFn: (id: string) => webhooks.rotateSecret(id),
    onSuccess: showSecret,
    onError: fail,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim() && url.trim() && (allEvents || events.length)) create.mutate();
  }

  function toggleEvent(value: WebhookEvent, checked: boolean) {
    setEvents((current) => (checked ? [...current, value] : current.filter((item) => item !== value)));
  }

  async function copySecret(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  // The list answers 403 for members who are not admins: say so instead of showing an error.
  const forbidden = hooks.isError && (hooks.error as { response?: { status?: number } }).response?.status === 403;
  const describeEvents = (hook: Webhook) =>
    hook.events.length === 0 ? t('webhooks.allEvents') : t('webhooks.someEvents', { count: hook.events.length });

  return (
    <section className="space-y-4" data-testid="webhooks-section">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('webhooks.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('webhooks.desc')}</p>
      </div>
      {error && (
        <Alert variant="destructive" onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {forbidden ? (
        <Alert>{t('webhooks.adminOnly')}</Alert>
      ) : (
        <>
          <form className="space-y-3" onSubmit={submit}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input label={t('webhooks.name')} required maxLength={255} value={name} onChange={(e) => setName(e.target.value)} />
              <Input
                label={t('webhooks.url')}
                type="url"
                required
                placeholder="https://example.com/jt-code/webhooks"
                pattern="https://.+"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={allEvents} onChange={(e) => setAllEvents(e.target.checked)} data-testid="webhook-all-events" />
              {t('webhooks.allEventsLabel')}
            </label>
            {!allEvents && (
              <fieldset className="grid grid-cols-1 gap-1 sm:grid-cols-2" data-testid="webhook-events">
                <legend className="sr-only">{t('webhooks.eventsLabel')}</legend>
                {WEBHOOK_EVENTS.map((value) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={events.includes(value)} onChange={(e) => toggleEvent(value, e.target.checked)} />
                    <span>{t(`webhooks.events.${value.replace(/\./g, '_')}`)}</span>
                  </label>
                ))}
              </fieldset>
            )}
            <Button type="submit" disabled={create.isPending || !name.trim() || !url.trim() || (!allEvents && events.length === 0)} data-testid="create-webhook">
              {create.isPending ? <Spinner size="sm" /> : <WebhookIcon size={16} aria-hidden="true" />}
              {t('webhooks.create')}
            </Button>
          </form>

          {secret && (
            <div className="space-y-2 rounded-lg border border-border p-4" data-testid="webhook-secret-panel">
              <p className="text-sm font-medium text-foreground">{t('webhooks.secretOnce', { name: secret.name })}</p>
              <div className="flex gap-2">
                <Input readOnly value={secret.secret} aria-label={t('webhooks.secretLabel')} onFocus={(e) => e.target.select()} data-testid="webhook-secret" />
                <Button type="button" variant="outline" onClick={() => void copySecret(secret.secret)}>
                  {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                  {copied ? t('developer.copied') : t('webhooks.copySecret')}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">{t('webhooks.verifyHelp')}</p>
            </div>
          )}

          {hooks.isPending ? (
            <Spinner size="sm" />
          ) : hooks.isError ? (
            <Alert variant="destructive">{apiErrorMessage(hooks.error)}</Alert>
          ) : hooks.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('webhooks.none')}</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border" data-testid="webhooks">
              {hooks.data.map((hook) => (
                <li key={hook.id} className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                        <span className="truncate">{hook.name}</span>
                        <Badge variant={hook.status === 'active' ? 'secondary' : 'outline'}>{t(`webhooks.status.${hook.status}`)}</Badge>
                        {hook.isVerified && <Badge variant="outline">{t('webhooks.verified')}</Badge>}
                      </div>
                      <div className="truncate text-sm text-muted-foreground">{hook.url}</div>
                      <div className="text-sm text-muted-foreground">
                        {[
                          describeEvents(hook),
                          hook.lastSuccessAt ? t('webhooks.lastSuccess', { date: formatDate(hook.lastSuccessAt) }) : '',
                          hook.failureCount ? t('webhooks.failures', { count: hook.failureCount }) : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    <Button type="button" variant="outline" size="sm" disabled={sendTest.isPending} onClick={() => sendTest.mutate(hook.id)} data-testid={`webhook-test-${hook.id}`}>
                      <Send size={14} aria-hidden="true" />
                      {t('webhooks.test')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={setStatus.isPending}
                      onClick={() => setStatus.mutate({ id: hook.id, status: hook.status === 'active' ? 'paused' : 'active' })}
                    >
                      {hook.status === 'active' ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
                      {hook.status === 'active' ? t('webhooks.pause') : t('webhooks.resume')}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(open === hook.id ? null : hook.id)} aria-expanded={open === hook.id}>
                      {t('webhooks.deliveries')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={rotate.isPending}
                      aria-label={t('webhooks.rotateFor', { name: hook.name })}
                      onClick={() =>
                        void confirm({
                          title: t('webhooks.rotateTitle'),
                          description: t('webhooks.rotateConfirm', { name: hook.name }),
                          confirmLabel: t('webhooks.rotate'),
                          destructive: true,
                        }).then((ok) => ok && rotate.mutate(hook.id))
                      }
                    >
                      <RefreshCw size={14} aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={remove.isPending}
                      aria-label={t('webhooks.deleteFor', { name: hook.name })}
                      onClick={() =>
                        void confirm({
                          title: t('webhooks.deleteTitle'),
                          description: t('webhooks.deleteConfirm', { name: hook.name }),
                          confirmLabel: t('webhooks.delete'),
                          destructive: true,
                        }).then((ok) => ok && remove.mutate(hook.id))
                      }
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </Button>
                  </div>
                  {hook.status === 'disabled' && <Alert>{t('webhooks.disabledHelp')}</Alert>}
                  {open === hook.id && <Deliveries hook={hook} />}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {dialog}
    </section>
  );
}
