import type { useApiClient } from '@/lib/api/client';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  created_at: string;
}

export async function getOrganization(client: ReturnType<typeof useApiClient>) {
  const response = await client.get<Organization>('/settings/organization/');
  return response.data;
}

export async function updateOrganization(
  client: ReturnType<typeof useApiClient>,
  data: Partial<Organization>
) {
  const response = await client.patch<Organization>('/settings/organization/', data);
  return response.data;
}
