import { simulate } from './latency';
import type { AuditRepository } from '../contracts';
import type { AuditFilter } from '../types';

/** Frontend-only mode has no server, so nothing is audited. */
export class MockAuditRepository implements AuditRepository {
  list(_filter: AuditFilter, _page: number) {
    return simulate('audit.list', () => ({ events: [], hasMore: false }));
  }
  exportCsv(_filter: AuditFilter) {
    return simulate('audit.export', () => new Blob(['created_at,actor_email,category,action\n'], { type: 'text/csv' }));
  }
}
