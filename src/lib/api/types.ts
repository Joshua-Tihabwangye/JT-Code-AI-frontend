/** Backend error envelope ({code,message,details,requestId}); some views send plain DRF {detail}. */
export interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: Record<string, unknown> | null;
  detail?: string;
  errors?: Record<string, string[]>;
  requestId?: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
