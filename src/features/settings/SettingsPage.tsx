import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser, supabase } from '@/lib/supabase';
import { useApiClient } from '@/lib/api/client';
import { getUserProfile, updateUserProfile, deleteAccount } from '@/features/settings/api';
import { Button, Input, Select, Alert, PhoneNumberInput, Spinner } from '@/shared/components';
import { User, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/lib/api/client';
import { COUNTRY_METADATA, getCountryMetadata, type CountryMetadata } from '@/features/auth/lib/countryMetadata';
import { formatPhoneNumberForCountry } from '@/features/auth/lib/phone';
import type { UserProfile } from '@/features/settings/api';

function resolveCountry(value?: string): CountryMetadata {
  if (value) {
    const byCode = getCountryMetadata(value);
    if (byCode) return byCode;
    const byName = COUNTRY_METADATA.find((c) => c.name.toLowerCase() === value.toLowerCase());
    if (byName) return byName;
  }
  return getCountryMetadata('UG') ?? COUNTRY_METADATA[0]!;
}

export function SettingsPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const queryClient = useQueryClient();
  const supabaseUser = useUser();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const user = useQuery({ queryKey: ['user-profile'], queryFn: () => getUserProfile(client) });

  const [profileForm, setProfileForm] = useState<Partial<UserProfile>>({});

  useEffect(() => {
    const backend = user.data;
    const supabaseMeta = supabaseUser?.user_metadata as { avatar_url?: string } || {};
    const country = resolveCountry(backend?.country);
    const tz = backend?.timezone || '';
    const timezoneInCountry = country.timezones.includes(tz) ? tz : (country.timezones[0] ?? '');
    setProfileForm({
      first_name: backend?.first_name || '',
      last_name: backend?.last_name || '',
      email: backend?.email || supabaseUser?.email || '',
      country: country.code,
      contact: backend?.contact || '',
      timezone: timezoneInCountry,
    });
    setAvatarUrl(supabaseMeta.avatar_url || '');
  }, [user.data, supabaseUser]);

  const updateProfileMutation = useMutation({
    mutationFn: (data: Partial<UserProfile>) => updateUserProfile(client, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      setSuccess(t('settings.profileUpdated'));
      setEditing(false);
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: () => setError(t('settings.updateProfileError')),
  });

  const deleteAccountMutation = useMutation({
    mutationFn: () => deleteAccount(client),
    onSuccess: async () => {
      await supabase.auth.signOut();
      window.location.href = '/sign-in';
    },
    onError: () => setError(t('settings.deleteAccountError')),
  });

  function handleProfileChange(field: keyof UserProfile, value: string) {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleCountryChange(code: string) {
    const country = getCountryMetadata(code);
    if (!country) return;
    setProfileForm((prev) => ({
      ...prev,
      country: country.code,
      timezone: country.timezones[0] ?? '',
    }));
  }

  function handleContactBlur(value: string) {
    const country = getCountryMetadata(profileForm.country || '');
    if (!country) return;
    const formatted = formatPhoneNumberForCountry(value, country.code);
    if (formatted && formatted !== value) {
      setProfileForm((prev) => ({ ...prev, contact: formatted }));
    }
  }

  function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    const hasProfileContent = [profileForm.first_name, profileForm.last_name, profileForm.contact]
      .some((value) => typeof value === 'string' && value.trim().length > 0);
    if (!hasProfileContent) {
      setError('Add a first name, last name, or contact number before saving your profile.');
      return;
    }
    const payload = { ...profileForm };
    delete payload.email;
    if (avatarUrl) {
      payload.avatar_url = avatarUrl;
    }
    updateProfileMutation.mutate(payload);
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).slice(2)}.${fileExt}`;

    supabase.storage
      .from('avatars')
      .upload(fileName, file, { cacheControl: 'public, max-age=31536000', upsert: true })
      .then(async (result) => {
        if (result?.error) throw new Error((result.error as unknown as string) || 'Upload failed');
        const publicUrl = supabase.storage.from('avatars').getPublicUrl(fileName).data.publicUrl;
        setAvatarUrl(publicUrl);
        try {
          await supabase.auth.updateUser({ data: { avatar_url: publicUrl } });
        } catch (metaErr) {
          console.error('Failed to persist avatar metadata:', metaErr);
        }
      })
      .catch((err) => {
        console.error('Avatar upload error:', err);
        setError(t('settings.uploadAvatarError'));
      });
  }

  function handleProfileReset() {
    const backend = user.data;
    const supabaseMeta = supabaseUser?.user_metadata as { avatar_url?: string } || {};
    const country = resolveCountry(backend?.country);
    const tz = backend?.timezone || '';
    const timezoneInCountry = country.timezones.includes(tz) ? tz : (country.timezones[0] ?? '');
    setProfileForm({
      first_name: backend?.first_name || '',
      last_name: backend?.last_name || '',
      email: backend?.email || supabaseUser?.email || '',
      country: country.code,
      contact: backend?.contact || '',
      timezone: timezoneInCountry,
    });
    setAvatarUrl(supabaseMeta.avatar_url || '');
  }

  function handleDeleteAccount() {
    if (window.confirm(t('settings.deleteAccountConfirm'))) {
      deleteAccountMutation.mutate();
    }
  }

  const selectedCountry = getCountryMetadata(profileForm.country || '');
  const countryOptions = COUNTRY_METADATA.map((c) => ({
    value: c.code,
    label: `${c.flag} ${c.name} (${c.dialCode})`,
  }));
  const timezoneOptions = (selectedCountry?.timezones ?? []).map((tz) => ({ value: tz, label: tz }));

  const meta = supabaseUser?.user_metadata as { full_name?: string; name?: string } | undefined;
  const displayName =
    meta?.full_name ||
    meta?.name ||
    `${profileForm.first_name || ''} ${profileForm.last_name || ''}`.trim() ||
    t('settings.yourProfile');

  return (
    <section className="workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>{t('settings.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('settings.subtitle')}</p>
        </div>
        {!editing && !user.isPending && (
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

      <div className="settings-layout max-w-4xl mx-auto">
        {user.isPending && (
          <div className="settings-loading" role="status" aria-live="polite">
            <Spinner size="sm" />
            <span>{t('common.loading')}</span>
          </div>
        )}
        {user.isError && (
          <Alert variant="destructive" role="alert">
            {apiErrorMessage(user.error)}
          </Alert>
        )}
        <div className="settings-profile-summary">
          {editing ? (
            <button
              type="button"
              className="settings-avatar-button"
              title={t('settings.changePhoto')}
              onClick={() => avatarInputRef.current?.click()}
              aria-label={t('settings.changePhoto')}
            >
              <span className="settings-avatar-frame">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User size={36} className="text-muted-foreground" aria-hidden="true" />
                )}
              </span>
            </button>
          ) : (
            <div className="settings-avatar-frame">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <User size={36} className="text-muted-foreground" aria-hidden="true" />
              )}
            </div>
          )}
          {editing && <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />}
          <div>
            <div className="text-base font-semibold text-foreground">{displayName}</div>
            <div className="text-sm text-muted-foreground">{supabaseUser?.email || profileForm.email}</div>
          </div>
        </div>

        <section className="settings-panel">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-foreground">{t('settings.profileInformation')}</h2>
            <p className="text-sm text-muted-foreground">{t('settings.profileInformationDesc')}</p>
          </div>
          <form onSubmit={handleProfileSubmit} className="space-y-5 max-w-4xl mx-auto">
            <div className="grid gap-4 md:grid-cols-2">
              <Input label={t('settings.firstName')} value={profileForm.first_name || ''} onChange={(e) => handleProfileChange('first_name', e.target.value)} disabled={!editing} />
              <Input label={t('settings.lastName')} value={profileForm.last_name || ''} onChange={(e) => handleProfileChange('last_name', e.target.value)} disabled={!editing} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label={t('settings.email')}
                type="email"
                value={profileForm.email || ''}
                readOnly
                aria-readonly="true"
              />
              <div className="w-full">
                <label htmlFor="country" className="block text-sm font-medium text-foreground mb-1.5">
                  {t('settings.country')}
                </label>
                <Select
                  id="country"
                  options={countryOptions}
                  value={profileForm.country || ''}
                  disabled={!editing}
                  onChange={(e) => handleCountryChange(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="w-full">
                <PhoneNumberInput
                  id="contact"
                  label={t('settings.contact')}
                  dialCode={selectedCountry?.dialCode}
                  value={profileForm.contact || ''}
                  onChange={(e) => handleProfileChange('contact', e.target.value)}
                  onBlur={(e) => handleContactBlur(e.target.value)}
                  disabled={!editing}
                />
              </div>
              <div className="w-full">
                <label htmlFor="timezone" className="block text-sm font-medium text-foreground mb-1.5">
                  {t('settings.timezone')}
                </label>
                  <Select
                    id="timezone"
                    options={timezoneOptions}
                    placeholder={timezoneOptions.length ? undefined : t('settings.noTimezone')}
                    value={profileForm.timezone || ''}
                    disabled={!editing || !timezoneOptions.length}
                    onChange={(e) => handleProfileChange('timezone', e.target.value)}
                  />
              </div>
            </div>

            {editing && (
              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" disabled={updateProfileMutation.isPending}>
                  {updateProfileMutation.isPending ? t('common.loading') : t('common.saveChanges')}
                </Button>
                <Button type="button" variant="outline" onClick={() => { handleProfileReset(); setEditing(false); }}>{t('common.cancel')}</Button>
              </div>
            )}
          </form>
        </section>

        <section className="settings-danger-panel">
          <h2 className="text-lg font-semibold text-destructive mb-1">{t('settings.dangerZone')}</h2>
          <p className="text-sm text-muted-foreground mb-4">{t('settings.deleteAccountDesc')}</p>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDeleteAccount}
            disabled={deleteAccountMutation.isPending}
          >
            {deleteAccountMutation.isPending ? t('common.loading') : t('settings.deleteAccount')}
          </Button>
        </section>
      </div>
    </section>
  );
}
