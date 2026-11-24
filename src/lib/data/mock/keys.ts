// Storage keys for the mock repositories. Centralised so seeding, migrations
// and repositories share one source of truth.
export const KEYS = {
  account: 'jtcode:account',
  users: 'jtcode:users',
  session: 'jtcode:session',
  plans: 'jtcode:plans',
  subscription: 'jtcode:subscription',
  wallet: 'jtcode:wallet',
  usage: 'jtcode:usage',
  invoices: 'jtcode:invoices',
  paymentMethod: 'jtcode:payment-method',
  integrations: 'jtcode:integrations',
  knowledge: 'jtcode:knowledge-collections',
  files: 'jtcode:files',
  documents: 'jtcode:documents',
  conversations: 'jtcode:conversations',
  messages: 'jtcode:messages',
  images: 'jtcode:image-generations',
  team: 'jtcode:team',
  apiKeys: 'jtcode:api-keys',
  webhooks: 'jtcode:webhooks',
  seeded: 'jtcode:seeded',
} as const;
