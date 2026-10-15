import { type ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal

  isOpen={open}
  onClose={onCancel}
  title={title}
  description={typeof description === 'string' ? description : undefined}
  size="sm"
  role="alertdialog"
  aria-modal="true"
  hideCloseButton
>
      {description && typeof description !== 'string' ? (
        <div className="text-sm text-muted-foreground leading-relaxed">{description}</div>
      ) : null}
      <div className="mt-6 flex justify-end gap-2.5">
        <Button variant="outline" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={destructive ? 'destructive' : 'primary'} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}