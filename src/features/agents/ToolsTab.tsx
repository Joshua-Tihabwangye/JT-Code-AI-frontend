import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, KeyRound, Plug, RefreshCw, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRepository, type McpServer, type ToolCredential } from '@/lib/data';
import { apiErrorMessage } from '@/lib/api/http';
import { formatDateTime } from '@/i18n/format';
import { slugify } from '@/features/agents/agents';
import { Alert, Badge, Button, Input, Select, Spinner, useConfirm } from '@/shared/components';

const isForbidden = (error: unknown) => (error as { response?: { status?: number } } | null)?.response?.status === 403;

/** Tool calls an agent asked to make that need a person's decision. */
function Approvals({ onError }: { onError: (message: string) => void }) {
  const { t } = useTranslation();
  const tools = useRepository('tools');
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const pending = useQuery({ queryKey: ['tool-approvals', 'pending'], queryFn: () => tools.approvals('pending'), refetchInterval: 15_000 });
  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => tools.decide(id, approve, notes[id] ?? ''),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tool-approvals'] }),
    onError: (err) => onError(apiErrorMessage(err)),
  });
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('tools.approvalsTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('tools.approvalsDesc')}</p>
      </div>
      {pending.isPending ? (
        <Spinner size="sm" />
      ) : pending.isError ? (
        <Alert variant="destructive">{apiErrorMessage(pending.error)}</Alert>
      ) : pending.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('tools.noApprovals')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border" data-testid="tool-approvals">
          {pending.data.map((approval) => (
            <li key={approval.id} className="space-y-2 p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <code className="text-xs">{approval.toolName}</code>
                <span className="min-w-0 flex-1 text-foreground">{approval.summary}</span>
                {approval.expiresAt && <span className="text-xs text-muted-foreground">{t('tools.expires', { date: formatDateTime(approval.expiresAt) })}</span>}
              </div>
              <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs">{JSON.stringify(approval.arguments, null, 2)}</pre>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-48 flex-1">
                  <Input
                    label={t('tools.note')}
                    maxLength={2000}
                    value={notes[approval.id] ?? ''}
                    onChange={(e) => setNotes((current) => ({ ...current, [approval.id]: e.target.value }))}
                  />
                </div>
                <Button type="button" size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: approval.id, approve: true })} data-testid={`approve-${approval.id}`}>
                  <Check size={14} aria-hidden="true" />
                  {t('tools.approve')}
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: approval.id, approve: false })}>
                  <X size={14} aria-hidden="true" />
                  {t('tools.reject')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Admins: connect MCP servers and store the credentials tools use (secrets are write-only). */
function Connections({ onError }: { onError: (message: string) => void }) {
  const { t } = useTranslation();
  const { confirm, dialog } = useConfirm();
  const tools = useRepository('tools');
  const queryClient = useQueryClient();
  const [serverName, setServerName] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [serverCredential, setServerCredential] = useState('');
  const [credentialName, setCredentialName] = useState('');
  const [provider, setProvider] = useState<ToolCredential['provider']>('mcp');
  const [secret, setSecret] = useState('');

  const servers = useQuery({ queryKey: ['mcp-servers'], queryFn: () => tools.mcpServers(), retry: false });
  const credentials = useQuery({ queryKey: ['tool-credentials'], queryFn: () => tools.credentials(), retry: false });
  const refresh = () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: ['mcp-servers'] }), queryClient.invalidateQueries({ queryKey: ['tool-credentials'] })]);
  const fail = (err: unknown) => onError(apiErrorMessage(err));

  const addServer = useMutation({
    mutationFn: () => tools.addMcpServer({ name: serverName.trim(), slug: slugify(serverName), url: serverUrl.trim(), credentialId: serverCredential || null }),
    onSuccess: async () => {
      setServerName('');
      setServerUrl('');
      await refresh();
    },
    onError: fail,
  });
  const discover = useMutation({ mutationFn: (id: string) => tools.discover(id), onSuccess: refresh, onError: fail });
  const allow = useMutation({
    mutationFn: ({ server, names }: { server: McpServer; names: string[] }) => tools.setAllowedTools(server.id, names),
    onSuccess: refresh,
    onError: fail,
  });
  const removeServer = useMutation({ mutationFn: (id: string) => tools.removeMcpServer(id), onSuccess: refresh, onError: fail });
  const addCredential = useMutation({
    // The server keys credentials by a slug ("docs-mcp"); people type a name ("Docs MCP").
    mutationFn: () => tools.addCredential({ provider, name: slugify(credentialName), secret }),
    onSuccess: async () => {
      setCredentialName('');
      setSecret('');
      await refresh();
    },
    onError: fail,
  });
  const removeCredential = useMutation({ mutationFn: (id: string) => tools.removeCredential(id), onSuccess: refresh, onError: fail });

  if (isForbidden(servers.error) || isForbidden(credentials.error)) return <Alert>{t('tools.adminOnly')}</Alert>;

  function submitServer(event: FormEvent) {
    event.preventDefault();
    if (serverName.trim() && /^https:\/\//.test(serverUrl.trim())) addServer.mutate();
  }
  function submitCredential(event: FormEvent) {
    event.preventDefault();
    if (credentialName.trim() && secret) addCredential.mutate();
  }

  return (
    <>
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('tools.serversTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('tools.serversDesc')}</p>
        </div>
        <form className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.5fr_12rem_auto] sm:items-end" onSubmit={submitServer}>
          <Input label={t('tools.serverName')} maxLength={120} value={serverName} onChange={(e) => setServerName(e.target.value)} />
          <Input label={t('tools.serverUrl')} type="url" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
          <div>
            <label htmlFor="mcp-credential" className="mb-1.5 block text-sm font-medium text-foreground">
              {t('tools.credential')}
            </label>
            <Select
              id="mcp-credential"
              value={serverCredential}
              onChange={(e) => setServerCredential(e.target.value)}
              options={[{ value: '', label: t('tools.noCredential') }, ...(credentials.data ?? []).map((item) => ({ value: item.id, label: item.name }))]}
            />
          </div>
          <Button type="submit" disabled={addServer.isPending || !serverName.trim() || !/^https:\/\//.test(serverUrl.trim())} data-testid="mcp-add">
            <Plug size={16} aria-hidden="true" />
            {t('tools.addServer')}
          </Button>
        </form>
        {servers.data && servers.data.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border" data-testid="mcp-servers">
            {servers.data.map((server) => (
              <li key={server.id} className="space-y-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {server.name} <span className="text-muted-foreground">{server.url}</span>
                  </span>
                  <Badge variant={server.status === 'active' ? 'secondary' : 'outline'}>{t(`tools.serverStatus.${server.status}`)}</Badge>
                  <Button type="button" variant="outline" size="sm" disabled={discover.isPending} onClick={() => discover.mutate(server.id)}>
                    <RefreshCw size={14} aria-hidden="true" />
                    {t('tools.discover')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t('tools.removeFor', { name: server.name })}
                    onClick={() =>
                      void confirm({ title: t('tools.removeTitle'), description: t('tools.removeConfirm', { name: server.name }), confirmLabel: t('tools.remove'), destructive: true }).then(
                        (ok) => ok && removeServer.mutate(server.id),
                      )
                    }
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </Button>
                </div>
                {server.lastError && <p className="text-sm text-destructive">{server.lastError}</p>}
                {server.discoveredTools.length > 0 && (
                  <fieldset className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    <legend className="text-xs text-muted-foreground">{t('tools.allowHelp')}</legend>
                    {server.discoveredTools.map((tool) => (
                      <label key={tool.name} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={server.allowedTools.includes(tool.name)}
                          disabled={allow.isPending}
                          onChange={(e) =>
                            allow.mutate({
                              server,
                              names: e.target.checked ? [...server.allowedTools, tool.name] : server.allowedTools.filter((name) => name !== tool.name),
                            })
                          }
                        />
                        <code className="text-xs">{tool.name}</code>
                      </label>
                    ))}
                  </fieldset>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('tools.credentialsTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('tools.credentialsDesc')}</p>
        </div>
        <form className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr_1fr_auto] sm:items-end" onSubmit={submitCredential}>
          <div>
            <label htmlFor="credential-provider" className="mb-1.5 block text-sm font-medium text-foreground">
              {t('tools.provider')}
            </label>
            <Select
              id="credential-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as ToolCredential['provider'])}
              options={(['mcp', 'http', 'github', 'slack'] as const).map((value) => ({ value, label: t(`tools.providers.${value}`) }))}
            />
          </div>
          <Input label={t('tools.credentialName')} maxLength={120} value={credentialName} onChange={(e) => setCredentialName(e.target.value)} />
          <Input label={t('tools.secret')} type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} />
          <Button type="submit" disabled={addCredential.isPending || !credentialName.trim() || !secret} data-testid="credential-add">
            <KeyRound size={16} aria-hidden="true" />
            {t('tools.addCredential')}
          </Button>
        </form>
        {credentials.data && credentials.data.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border" data-testid="tool-credentials">
            {credentials.data.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                <KeyRound size={14} className="text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{item.name}</span>
                <Badge variant="outline">{t(`tools.providers.${item.provider}`)}</Badge>
                <span className="text-xs text-muted-foreground">{item.hasSecret ? t('tools.secretStored') : t('tools.noSecret')}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t('tools.removeFor', { name: item.name })}
                  onClick={() =>
                    void confirm({ title: t('tools.removeTitle'), description: t('tools.removeConfirm', { name: item.name }), confirmLabel: t('tools.remove'), destructive: true }).then(
                      (ok) => ok && removeCredential.mutate(item.id),
                    )
                  }
                >
                  <Trash2 size={14} aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {dialog}
    </>
  );
}

/** Agents → Tools: approvals, the tool catalogue, and (admins) MCP servers and credentials. */
export function ToolsTab() {
  const { t } = useTranslation();
  const tools = useRepository('tools');
  const [error, setError] = useState('');
  const catalog = useQuery({ queryKey: ['tools'], queryFn: () => tools.catalog() });
  return (
    <div className="space-y-10" data-testid="tools-tab">
      {error && (
        <Alert variant="destructive" onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      <Approvals onError={setError} />
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('tools.catalogTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('tools.catalogDesc')}</p>
        </div>
        {catalog.isPending ? (
          <Spinner size="sm" />
        ) : catalog.isError ? (
          <Alert variant="destructive">{apiErrorMessage(catalog.error)}</Alert>
        ) : catalog.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('tools.noTools')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border" data-testid="tool-catalog">
            {catalog.data.map((tool) => (
              <li key={tool.name} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                <code className="text-xs">{tool.name}</code>
                <span className="min-w-0 flex-1 text-muted-foreground">{tool.description}</span>
                {tool.requiresApproval !== false && <Badge variant="outline">{t('tools.needsApproval')}</Badge>}
                {!tool.available && <Badge variant="outline">{t('tools.roleNeeded', { role: tool.minRole })}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <Connections onError={setError} />
    </div>
  );
}
