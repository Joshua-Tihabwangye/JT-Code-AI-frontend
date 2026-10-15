import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { config } from '@/lib/config';
import { useRepositories } from '@/lib/data';

export function AppDataInitializer() {
  const { isSignedIn, loading, user } = useAuth();
  const repositories = useRepositories();
  const previousUser = useRef<string | null | undefined>(undefined);

  // Cached server data belongs to one user: drop it whenever the signed-in user changes.
  useEffect(() => {
    if (loading) return;
    const current = user?.id ?? null;
    if (previousUser.current !== undefined && previousUser.current !== current) queryClient.clear();
    previousUser.current = current;
  }, [loading, user?.id]);

  useEffect(() => {
    if (config.dataMode === 'mock' || loading || !isSignedIn) return;
    void queryClient.prefetchQuery({ queryKey: ['account'], queryFn: () => repositories.account.getAccount() });
    void queryClient.prefetchQuery({ queryKey: ['billing', 'wallet'], queryFn: () => repositories.billing.getWallet() });
    void queryClient.prefetchQuery({ queryKey: ['billing', 'usage'], queryFn: () => repositories.billing.getUsage() });
  }, [loading, isSignedIn, repositories]);

  return null;
}
