import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/supabase';
import { useRepository } from './RepositoryProvider';

/** The signed-in user's profile from the API (name, avatar, plan), shared via the ['account'] query. */
export function useAccount() {
  const { isSignedIn } = useAuth();
  const accounts = useRepository('account');
  return useQuery({
    queryKey: ['account'],
    queryFn: () => accounts.getAccount(),
    enabled: isSignedIn,
    staleTime: 60_000,
  });
}
