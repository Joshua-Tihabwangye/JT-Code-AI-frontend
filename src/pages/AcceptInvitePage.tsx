import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AuthLayout from '@/auth/AuthLayout';
import { useRepository, type AcceptedInvite } from '@/lib/data';
import { apiErrorMessage } from '@/lib/api/http';
import { setActiveWorkspaceId } from '@/lib/workspace';
import { Alert, Button, Spinner } from '@/shared/components';

/**
 * `/invite/:inviteId?token=…`: the link an admin shares from Settings → Team. The route sits behind
 * `RequireAuth`, so a signed-out visitor signs in first and comes back here (`?next=`). Joining is an
 * explicit click; the server checks the token and that the signed-in e-mail is the invited one.
 */
export default function AcceptInvitePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const team = useRepository('team');
  const accounts = useRepository('account');
  const { inviteId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [joined, setJoined] = useState<AcceptedInvite | null>(null);

  const account = useQuery({ queryKey: ['account'], queryFn: () => accounts.getAccount() });
  const accept = useMutation({
    mutationFn: () => team.acceptInvite(inviteId, token),
    onSuccess: async (result) => {
      setJoined(result);
      // Work in the workspace just joined; every cached answer belonged to the previous one.
      setActiveWorkspaceId(result.workspace.id);
      await queryClient.resetQueries();
    },
  });

  return (
    <AuthLayout>
      <div className="mx-auto w-full max-w-md space-y-5" data-testid="accept-invite">
        <div className="flex items-center gap-3">
          {joined ? <CheckCircle2 size={28} className="text-success" aria-hidden="true" /> : <Users size={28} className="text-primary" aria-hidden="true" />}
          <h1 className="text-2xl font-semibold text-foreground">{t('team.accept.title')}</h1>
        </div>

        {!inviteId || !token ? (
          <Alert variant="destructive">{t('team.accept.invalidLink')}</Alert>
        ) : joined ? (
          <>
            <Alert variant="success">
              {t('team.accept.joined', { name: joined.workspace.name, role: t(`team.roles.${joined.member.role}`) })}
            </Alert>
            <Button type="button" className="w-full" onClick={() => void navigate('/app/chat', { replace: true })}>
              {t('team.accept.open')}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t('team.accept.desc')}</p>
            {account.data?.email && <p className="text-sm text-foreground">{t('team.accept.signedInAs', { email: account.data.email })}</p>}
            {accept.isError && <Alert variant="destructive">{apiErrorMessage(accept.error)}</Alert>}
            <div className="flex gap-3">
              <Button type="button" className="flex-1" disabled={accept.isPending} onClick={() => accept.mutate()}>
                {accept.isPending && <Spinner size="sm" />}
                {accept.isPending ? t('team.accept.joining') : t('team.accept.join')}
              </Button>
              <Button type="button" variant="outline" onClick={() => void navigate('/app/chat')}>
                {t('team.accept.later')}
              </Button>
            </div>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
