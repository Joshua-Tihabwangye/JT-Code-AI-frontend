import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRepository, type ApiKey, type ApiKeyScope, type CreatedApiKey } from '@/lib/data';
import { apiErrorMessage } from '@/lib/api/http';
import { config } from '@/lib/config';
import { formatDate } from '@/i18n/format';
import { apiAddress, EXPIRY_DAYS, expiryFrom, type Expiry } from '@/features/settings/developer';
import { Alert, Badge, Button, Input, Select, Spinner, useConfirm } from '@/shared/components';
import { WebhooksSection } from '@/features/settings/WebhooksSection';

/** Settings → Developer: organization API keys for server-to-server calls (`X-API-Key`). */
export function DeveloperTab() {
  const { t } = useTranslation();
  const { confirm, dialog } = useConfirm();
  const apiKeys = useRepository('apiKeys');
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [write, setWrite] = useState(false);
  const [expiry, setExpiry] = useState<Expiry>('90');
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const keys = useQuery({ queryKey: ['api-keys'], queryFn: () => apiKeys.list() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['api-keys'] });
  const fail = (err: unknown) => {
    setSuccess('');
    setError(apiErrorMessage(err));
  };

  const create = useMutation({
    mutationFn: () => {
      const scopes: ApiKeyScope[] = write ? ['read', 'write'] : ['read'];
      return apiKeys.create({ name: name.trim(), scopes, expiresAt: expiryFrom(expiry) });
    },
    onSuccess: async (next) => {
      setCreated(next);
      setCopied(false);
      setName('');
      setWrite(false);
      setError('');
      await refresh();
    },
    onError: fail,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => apiKeys.revoke(id),
    onSuccess: async (_key, id) => {
      if (created?.id === id) setCreated(null);
      setError('');
      setSuccess(t('developer.revoked'));
      await refresh();
    },
    onError: fail,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim()) create.mutate();
  }

  async function copyKey(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false); // clipboard blocked: the key stays selectable in the field
    }
  }

  const statusVariant = (status: ApiKey['status']) => (status === 'active' ? 'secondary' : 'outline');
  const expiryOptions = EXPIRY_DAYS.map((value) => ({ value, label: t(`developer.expiry.${value}`) }));

  return (
    <div className="space-y-10" data-testid="developer-tab">
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
      {config.dataMode === 'mock' && <Alert>{t('developer.mockNote')}</Alert>}

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-foreground">{t('developer.createTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('developer.createDesc')}</p>
        </div>
        <form className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_12rem_auto] md:items-end" onSubmit={submit}>
          <Input label={t('developer.name')} required maxLength={255} value={name} placeholder={t('developer.namePlaceholder')} onChange={(e) => setName(e.target.value)} />
          <div>
            <label htmlFor="key-expiry" className="block text-sm font-medium text-foreground mb-1.5">
              {t('developer.expiresLabel')}
            </label>
            <Select id="key-expiry" options={expiryOptions} value={expiry} onChange={(e) => setExpiry(e.target.value as Expiry)} />
          </div>
          <Button type="submit" disabled={create.isPending || !name.trim()} data-testid="create-api-key">
            {create.isPending ? <Spinner size="sm" /> : <KeyRound size={16} aria-hidden="true" />}
            {t('developer.create')}
          </Button>
        </form>
        <label className="mt-3 flex items-start gap-2 text-sm text-foreground">
          <input type="checkbox" className="mt-0.5" checked={write} onChange={(e) => setWrite(e.target.checked)} data-testid="api-key-write" />
          <span>
            {t('developer.writeScope')}
            <span className="block text-muted-foreground">{t('developer.scopeHelp')}</span>
          </span>
        </label>

        {created && (
          <div className="mt-4 space-y-3 rounded-lg border border-border p-4" data-testid="api-key-created">
            <p className="text-sm font-medium text-foreground">{t('developer.shownOnce', { name: created.name })}</p>
            <div className="flex gap-2">
              <Input readOnly value={created.key} aria-label={t('developer.keyLabel')} onFocus={(e) => e.target.select()} data-testid="api-key-secret" />
              <Button type="button" variant="outline" onClick={() => void copyKey(created.key)}>
                {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                {copied ? t('developer.copied') : t('developer.copy')}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">{t('developer.usage')}</p>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
              <code>{`curl -H "X-API-Key: ${created.key}" ${apiAddress()}/conversations/`}</code>
            </pre>
          </div>
        )}
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-foreground">{t('developer.listTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('developer.listDesc')}</p>
        </div>
        {keys.isPending ? (
          <Spinner size="sm" />
        ) : keys.isError ? (
          <Alert variant="destructive">{apiErrorMessage(keys.error)}</Alert>
        ) : keys.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('developer.none')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border" data-testid="api-keys">
            {keys.data.map((key) => (
              <li key={key.id} className="flex flex-wrap items-center gap-3 p-3">
                <KeyRound size={16} className="text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                    <span className="truncate">{key.name}</span>
                    <code className="text-xs text-muted-foreground">{key.prefix}_…</code>
                    <Badge variant={statusVariant(key.status)}>{t(`developer.status.${key.status}`)}</Badge>
                    {key.scopes.map((scope) => (
                      <Badge key={scope} variant="outline">
                        {t(`developer.scopes.${scope}`)}
                      </Badge>
                    ))}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {[
                      t('developer.createdOn', { date: formatDate(key.createdAt) }),
                      key.lastUsedAt ? t('developer.lastUsed', { date: formatDate(key.lastUsedAt) }) : t('developer.neverUsed'),
                      key.expiresAt ? t('developer.expiresOn', { date: formatDate(key.expiresAt) }) : t('developer.noExpiry'),
                      key.ownerEmail,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                {key.status === 'active' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={revoke.isPending}
                    aria-label={t('developer.revokeFor', { name: key.name })}
                    onClick={() =>
                      void confirm({
                        title: t('developer.revokeTitle'),
                        description: t('developer.revokeConfirm', { name: key.name }),
                        confirmLabel: t('developer.revoke'),
                        destructive: true,
                      }).then((ok) => ok && revoke.mutate(key.id))
                    }
                  >
                    <X size={14} aria-hidden="true" />
                    {t('developer.revoke')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <WebhooksSection />
      {dialog}
    </div>
  );
}
