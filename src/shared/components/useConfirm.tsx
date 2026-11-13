import { useCallback, useState, type ReactNode } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/**
 * An in-app confirmation (never the browser's `window.confirm`). Render `dialog` once, then
 * `if (await confirm({ title, description })) …`.
 */
export function useConfirm() {
  const [request, setRequest] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setRequest({ ...options, resolve })), []);
  const close = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };
  const dialog = (
    <ConfirmDialog
      open={request !== null}
      title={request?.title ?? ''}
      description={request?.description}
      confirmLabel={request?.confirmLabel}
      cancelLabel={request?.cancelLabel}
      destructive={request?.destructive}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  );
  return { confirm, dialog };
}
