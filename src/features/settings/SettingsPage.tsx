import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useRepository, type Account } from '@/lib/data';
import { apiErrorMessage } from '@/lib/api/http';
import { getOrganization, updateOrganization } from '@/features/settings/api';
import { useApiClient } from '@/lib/api/client';
import { config } from '@/lib/config';
import { Alert, Button, Input, PasswordInput, Select } from '@/shared/components';
import { COUNTRY_METADATA, getCountryMetadata, type CountryMetadata } from '@/features/auth/lib/countryMetadata';
import { formatPhoneNumberForCountry } from '@/features/auth/lib/phone';

interface ProfileForm {
  firstName: string;
  lastName: string;
  countryCode: string;
  contact: string;
  timezone: string;
}

function resolveCountry(code?: string, name?: string): CountryMetadata {
  return (
    (code && getCountryMetadata(code)) ||
    COUNTRY_METADATA.find((c) => c.name.toLowerCase() === (name ?? '').toLowerCase()) ||
    getCountryMetadata('UG') ||
    COUNTRY_METADATA[0]!
  );
}

function formFrom(account?: Account): ProfileForm {
  const country = resolveCountry(account?.countryCode, account?.countryName);
  const timezone = account?.timezone && country.timezones.includes(account.timezone) ? account.timezone : (country.timezones[0] ?? '');
  return {
    firstName: account?.firstName ?? '',
    lastName: account?.lastName ?? '',
    countryCode: country.code,
    contact: account?.contact ?? '',
    timezone,
  };
}

export function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const accounts = useRepository('account');
  const client = useApiClient();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProfileForm>(formFrom());
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [workspaceName, setWorkspaceName] = useState('');

  const account = useQuery({ queryKey: ['account'], queryFn: () => accounts.getAccount() });
  const organization = useQuery({
    queryKey: ['organization'],
    queryFn: () => getOrganization(client),
    enabled: config.dataMode === 'api',
  });

  useEffect(() => setForm(formFrom(account.data)), [account.data]);
  useEffect(() => setWorkspaceName(organization.data?.name ?? ''), [organization.data]);

  const flash = (message: string) => {
    setError('');
    setSuccess(message);
    window.setTimeout(() => setSuccess(''), 3000);
  };
  const fail = (err: unknown) => {
    setSuccess('');
    setError(apiErrorMessage(err));
  };
  const setAccount = (next: Account) => queryClient.setQueryData(['account'], next);

  const saveProfile = useMutation({
    mutationFn: (value: ProfileForm) => {
      const country = getCountryMetadata(value.countryCode);
      return accounts.updateAccount({
        firstName: value.firstName.trim(),
        lastName: value.lastName.trim(),
        countryCode: value.countryCode,
        countryName: country?.name ?? '',
        dialCode: country?.dialCode ?? '',
        contact: value.contact.trim(),
        timezone: value.timezone,
      });
    },
    onSuccess: (next) => {
      setAccount(next);
      setEditing(false);
      flash(t('settings.profileUpdated'));
    },
    onError: fail,
  });

  const uploadAvatar = useMutation({
    mutationFn: (file: File) => accounts.uploadAvatar(file),
    onSuccess: (next) => {
      setAccount(next);
      flash(t('settings.avatarUpdated'));
    },
    onError: fail,
  });
  const removeAvatar = useMutation({ mutationFn: () => accounts.removeAvatar(), onSuccess: setAccount, onError: fail });

  const changePassword = useMutation({
    mutationFn: () => accounts.changePassword(passwords),
    onSuccess: () => {
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      flash(t('settings.passwordChanged'));
    },
    onError: fail,
  });

  const renameWorkspace = useMutation({
    mutationFn: () => updateOrganization(client, { name: workspaceName.trim() }),
    onSuccess: (next) => {
      queryClient.setQueryData(['organization'], next);
      flash(t('settings.workspaceUpdated'));
    },
    onError: fail,
  });

  const deleteAccount = useMutation({
    mutationFn: () => accounts.deleteAccount(),
    onSuccess: () => void navigate('/sign-in', { replace: true }),
    onError: fail,
  });

  function submitProfile(event: FormEvent) {
    event.preventDefault();
    saveProfile.mutate(form);
  }

  function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (passwords.newPassword !== passwords.confirmPassword) {
      setError(t('settings.passwordMismatch'));
      return;
    }
    changePassword.mutate();
  }

  function changeCountry(code: string) {
    const country = getCountryMetadata(code);
    if (country) setForm((prev) => ({ ...prev, countryCode: country.code, timezone: country.timezones[0] ?? '' }));
  }

  function formatContact(value: string) {
    const country = getCountryMetadata(form.countryCode);
    if (!country) return;
    const formatted = formatPhoneNumberForCountry(value, country.code);
    if (formatted && formatted !== value) setForm((prev) => ({ ...prev, contact: formatted }));
  }

  const selectedCountry = getCountryMetadata(form.countryCode);
  const countryOptions = COUNTRY_METADATA.map((c) => ({ value: c.code, label: `${c.flag} ${c.name} (${c.dialCode})` }));
  const timezoneOptions = (selectedCountry?.timezones ?? []).map((tz) => ({ value: tz, label: tz }));
  const displayName = `${account.data?.firstName ?? ''} ${account.data?.lastName ?? ''}`.trim() || t('settings.yourProfile');
  const avatarUrl = account.data?.avatarUrl;

  return (
    <section className="workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{t('settings.eyebrow')}</p>
          <h1>{t('settings.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('settings.subtitle')}</p>
        </div>
        {!editing && (
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)} aria-label={t('settings.editProfile')}>
            <Pencil size={16} aria-hidden />
            <span>{t('settings.edit')}</span>
          </Button>
        )}
      </header>

      {error && (
        <Alert variant="destructive" className="mb-4" onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" className="mb-4" onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}
      {account.isError && <Alert variant="destructive" className="mb-4">{apiErrorMessage(account.error)}</Alert>}

      <div className="space-y-10 max-w-4xl mx-auto">
        <div className="flex items-center gap-4">
          <label
            className={`relative ${editing ? 'cursor-pointer group' : 'cursor-default'}`}
            title={editing ? t('settings.changePhoto') : undefined}
            aria-label={editing ? t('settings.changePhoto') : undefined}
          >
            <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center overflow-hidden border-2 border-border transition group-hover:opacity-80">
              {avatarUrl ? (
                <img src={avatarUrl} alt={t('settings.profilePicture')} className="w-full h-full object-cover" />
              ) : (
                <User size={36} className="text-muted-foreground" />
              )}
            </div>
            {editing && (
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                data-testid="avatar-input"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadAvatar.mutate(file);
                  e.target.value = '';
                }}
              />
            )}
          </label>
          <div>
            <div className="text-base font-semibold text-foreground">{displayName}</div>
            <div className="text-sm text-muted-foreground">{account.data?.email}</div>
            {editing && (
              <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                <span>{uploadAvatar.isPending ? t('common.loading') : t('settings.changePhoto')}</span>
                {avatarUrl && (
                  <button type="button" className="underline" onClick={() => removeAvatar.mutate()}>
                    {t('settings.removePhoto')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <section>
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-foreground">{t('settings.profileInformation')}</h2>
            <p className="text-sm text-muted-foreground">{t('settings.profileInformationDesc')}</p>
          </div>
          <form onSubmit={submitProfile} className="space-y-5 max-w-4xl mx-auto">
            <div className="grid gap-4 md:grid-cols-2">
              <Input label={t('settings.firstName')} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} disabled={!editing} />
              <Input label={t('settings.lastName')} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} disabled={!editing} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Input label={t('settings.email')} type="email" value={account.data?.email ?? ''} readOnly aria-readonly="true" />
              <div className="w-full">
                <label htmlFor="country" className="block text-sm font-medium text-foreground mb-1.5">{t('settings.country')}</label>
                <Select id="country" options={countryOptions} value={form.countryCode} disabled={!editing} onChange={(e) => changeCountry(e.target.value)} />
                <p className="mt-1.5 text-sm text-muted-foreground">{t('settings.countryHelp')}</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="w-full">
                <label htmlFor="contact" className="block text-sm font-medium text-foreground mb-1.5">{t('settings.contact')}</label>
                <input
                  id="contact"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={form.contact}
                  placeholder={selectedCountry?.phonePlaceholder ?? t('settings.contact')}
                  onChange={(e) => setForm({ ...form, contact: e.target.value })}
                  onBlur={(e) => formatContact(e.target.value)}
                  disabled={!editing}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
                />
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {t('settings.contactHelp', { country: selectedCountry?.name ?? t('settings.yourCountry') })}
                </p>
              </div>
              <div className="w-full">
                <label htmlFor="timezone" className="block text-sm font-medium text-foreground mb-1.5">{t('settings.timezone')}</label>
                <Select
                  id="timezone"
                  options={timezoneOptions}
                  placeholder={timezoneOptions.length ? undefined : t('settings.noTimezone')}
                  value={form.timezone}
                  disabled={!editing || !timezoneOptions.length}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                />
                <p className="mt-1.5 text-sm text-muted-foreground">{t('settings.timezoneHelp')}</p>
              </div>
            </div>
            {editing && (
              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" disabled={saveProfile.isPending}>
                  {saveProfile.isPending ? t('common.loading') : t('common.saveChanges')}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setForm(formFrom(account.data)); setEditing(false); }}>
                  {t('common.cancel')}
                </Button>
              </div>
            )}
          </form>
        </section>

        {config.dataMode === 'api' && organization.data && (
          <section>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground">{t('settings.workspace')}</h2>
              <p className="text-sm text-muted-foreground">{t('settings.workspaceDesc')}</p>
            </div>
            <form
              className="flex max-w-xl items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                renameWorkspace.mutate();
              }}
            >
              <Input label={t('settings.workspaceName')} value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} />
              <Button type="submit" variant="outline" disabled={renameWorkspace.isPending || !workspaceName.trim() || workspaceName === organization.data.name}>
                {t('common.saveChanges')}
              </Button>
            </form>
          </section>
        )}

        <section>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-foreground">{t('settings.password')}</h2>
            <p className="text-sm text-muted-foreground">{t('settings.passwordDesc')}</p>
          </div>
          <form onSubmit={submitPassword} className="grid max-w-xl gap-4">
            <label className="block text-sm font-medium text-foreground">
              <span className="mb-1.5 block">{t('settings.currentPassword')}</span>
              <PasswordInput
              value={passwords.currentPassword}
              autoComplete="current-password"
              onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}/>
            </label>
            <label className="block text-sm font-medium text-foreground">
              <span className="mb-1.5 block">{t('settings.newPassword')}</span>
              <PasswordInput
              value={passwords.newPassword}
              autoComplete="new-password"
              onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}/>
            </label>
            <label className="block text-sm font-medium text-foreground">
              <span className="mb-1.5 block">{t('settings.confirmPassword')}</span>
              <PasswordInput
              value={passwords.confirmPassword}
              autoComplete="new-password"
              onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}/>
            </label>
            <div>
              <Button
                type="submit"
                variant="outline"
                disabled={changePassword.isPending || !passwords.currentPassword || passwords.newPassword.length < 8}
              >
                {changePassword.isPending ? t('common.loading') : t('settings.changePassword')}
              </Button>
            </div>
          </form>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-destructive mb-1">{t('settings.dangerZone')}</h2>
          <p className="text-sm text-muted-foreground mb-4">{t('settings.deleteAccountDesc')}</p>
          <Button
            type="button"
            variant="destructive"
            className="gap-1.5"
            onClick={() => window.confirm(t('settings.deleteAccountConfirm')) && deleteAccount.mutate()}
            disabled={deleteAccount.isPending}
          >
            <Trash2 size={16} />
            {deleteAccount.isPending ? t('common.loading') : t('settings.deleteAccount')}
          </Button>
        </section>
      </div>
    </section>
  );
}
