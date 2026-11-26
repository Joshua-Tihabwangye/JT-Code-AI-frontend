import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy, Send, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  useRepository,
  type SupportCase,
  type SupportCategory,
  type SupportPriority,
} from '@/lib/data';
import { apiErrorMessage } from '@/lib/api/http';
import { config } from '@/lib/config';
import { formatDate } from '@/i18n/format';
import { Alert, Badge, Button, Input, Select, Spinner, Textarea, useConfirm } from '@/shared/components';

/** One case: its description, the conversation with support, a reply box and Close. */
function CaseThread({ item, onClosed }: { item: SupportCase; onClosed: () => void }) {
  const { t } = useTranslation();
  const { confirm, dialog } = useConfirm();
  const support = useRepository('support');
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const messages = useQuery({ queryKey: ['support-messages', item.id], queryFn: () => support.messages(item.id) });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['support-messages', item.id] }),
      queryClient.invalidateQueries({ queryKey: ['support-cases'] }),
    ]);
  const reply = useMutation({
    mutationFn: () => support.reply(item.id, body.trim()),
    onSuccess: async () => {
      setBody('');
      setError('');
      await refresh();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });
  const close = useMutation({
    mutationFn: () => support.close(item.id),
    onSuccess: async () => {
      await refresh();
      onClosed();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });
  const closed = item.status === 'closed';

  function submit(event: FormEvent) {
    event.preventDefault();
    if (body.trim()) reply.mutate();
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4" data-testid="support-thread">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground">{item.subject}</h3>
          <p className="text-sm text-muted-foreground">
            {[t(`support.categories.${item.category}`), t(`support.priorities.${item.priority}`), formatDate(item.createdAt)].join(' · ')}
          </p>
        </div>
        <Badge variant={closed ? 'outline' : 'secondary'}>{t(`support.status.${item.status}`)}</Badge>
      </div>
      {error && (
        <Alert variant="destructive" onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      <ol className="space-y-3">
        <li className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">{item.description}</li>
        {messages.isPending && <Spinner size="sm" />}
        {messages.data?.map((message) => (
          <li
            key={message.id}
            className={`rounded-md p-3 text-sm whitespace-pre-wrap ${message.author === 'support' ? 'border border-primary/30 bg-primary/5' : 'bg-muted'}`}
            data-testid={`support-message-${message.author}`}
          >
            <div className="mb-1 text-xs text-muted-foreground">
              {message.author === 'support' ? t('support.fromSupport', { brand: 'JT-Code' }) : message.authorName} · {formatDate(message.createdAt)}
            </div>
            {message.body}
          </li>
        ))}
      </ol>
      {closed ? (
        <p className="text-sm text-muted-foreground">{t('support.closedHelp')}</p>
      ) : (
        <form className="space-y-2" onSubmit={submit}>
          <Textarea label={t('support.reply')} rows={3} maxLength={10000} value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={reply.isPending || !body.trim()} data-testid="support-send-reply">
              {reply.isPending ? <Spinner size="sm" /> : <Send size={14} aria-hidden="true" />}
              {t('support.send')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={close.isPending}
              onClick={() =>
                void confirm({
                  title: t('support.closeTitle'),
                  description: t('support.closeConfirm', { subject: item.subject }),
                  confirmLabel: t('support.close'),
                }).then((ok) => ok && close.mutate())
              }
            >
              <X size={14} aria-hidden="true" />
              {t('support.close')}
            </Button>
          </div>
        </form>
      )}
      {dialog}
    </div>
  );
}

/** Settings → Support: open a case with JT-Code support and follow the conversation. */
export function SupportTab() {
  const { t } = useTranslation();
  const support = useRepository('support');
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<SupportCategory>('technical');
  const [priority, setPriority] = useState<SupportPriority>('medium');
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const cases = useQuery({ queryKey: ['support-cases'], queryFn: () => support.list() });
  const open = useMutation({
    mutationFn: () => support.open({ subject: subject.trim(), description: description.trim(), category, priority }),
    onSuccess: async (created) => {
      setSubject('');
      setDescription('');
      setError('');
      setSuccess(t('support.opened'));
      setSelected(created.id);
      await queryClient.invalidateQueries({ queryKey: ['support-cases'] });
    },
    onError: (err) => {
      setSuccess('');
      setError(apiErrorMessage(err));
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (subject.trim() && description.trim()) open.mutate();
  }

  const current = cases.data?.find((item) => item.id === selected);

  return (
    <div className="space-y-10" data-testid="support-tab">
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
      {config.dataMode === 'mock' && <Alert>{t('support.mockNote')}</Alert>}

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-foreground">{t('support.newTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('support.newDesc', { brand: 'JT-Code' })}</p>
        </div>
        <form className="space-y-4" onSubmit={submit}>
          <Input label={t('support.subject')} required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="support-category" className="mb-1.5 block text-sm font-medium text-foreground">
                {t('support.category')}
              </label>
              <Select
                id="support-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as SupportCategory)}
                options={SUPPORT_CATEGORIES.map((value) => ({ value, label: t(`support.categories.${value}`) }))}
              />
            </div>
            <div>
              <label htmlFor="support-priority" className="mb-1.5 block text-sm font-medium text-foreground">
                {t('support.priority')}
              </label>
              <Select
                id="support-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as SupportPriority)}
                options={SUPPORT_PRIORITIES.map((value) => ({ value, label: t(`support.priorities.${value}`) }))}
              />
            </div>
          </div>
          <Textarea
            label={t('support.description')}
            required
            rows={5}
            maxLength={10000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Button type="submit" disabled={open.isPending || !subject.trim() || !description.trim()} data-testid="support-open-case">
            {open.isPending ? <Spinner size="sm" /> : <LifeBuoy size={16} aria-hidden="true" />}
            {t('support.open')}
          </Button>
        </form>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-foreground">{t('support.listTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('support.listDesc')}</p>
        </div>
        {cases.isPending ? (
          <Spinner size="sm" />
        ) : cases.isError ? (
          <Alert variant="destructive">{apiErrorMessage(cases.error)}</Alert>
        ) : cases.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('support.none')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border" data-testid="support-cases">
            {cases.data.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center gap-2 p-3 text-left hover:bg-muted"
                  aria-expanded={selected === item.id}
                  onClick={() => setSelected(selected === item.id ? null : item.id)}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{item.subject}</span>
                  <Badge variant={item.status === 'closed' ? 'outline' : 'secondary'}>{t(`support.status.${item.status}`)}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(item.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {current && (
          <div className="mt-4">
            <CaseThread item={current} onClosed={() => setSuccess(t('support.closedNotice'))} />
          </div>
        )}
      </section>
    </div>
  );
}
