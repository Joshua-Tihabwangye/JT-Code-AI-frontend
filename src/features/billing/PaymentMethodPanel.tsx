import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CreditCard, ExternalLink, Lock, Plus, RefreshCw } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/http';
import { useRepository, type PaymentMethod, type SetupIntent } from '@/lib/data';
import { Alert, Badge, Button, Modal, Spinner } from '@/shared/components';
import { loadStripe, type StripeClient } from './stripe';

/** The saved card drawn as a card, so it is recognisable at a glance. */
function CardFace({ method }: { method: PaymentMethod }) {
  const { t } = useTranslation();
  const expiry = method.expMonth && method.expYear ? `${String(method.expMonth).padStart(2, '0')}/${String(method.expYear).slice(-2)}` : '';
  return (
    <div className="payment-card-face" data-testid="payment-card-face">
      <div className="flex items-start justify-between">
        <CreditCard size={26} aria-hidden />
        <Badge variant="secondary" className="payment-card-face__badge">{t('common.default')}</Badge>
      </div>
      <div className="payment-card-face__number" aria-label={t('billing.payment.panel.cardEnding', { last4: method.last4 })}>
        •••• •••• •••• {method.last4}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="payment-card-face__label">{t('billing.payment.panel.holder')}</div>
          <div className="truncate font-medium">{method.name || '—'}</div>
        </div>
        <div className="text-end">
          {expiry && <div className="payment-card-face__label">{t('billing.payment.panel.expires')}</div>}
          <div className="font-medium tabular-nums">{expiry}</div>
        </div>
        <div className="payment-card-face__brand">{method.brand}</div>
      </div>
    </div>
  );
}

/** Stripe's card form for a SetupIntent: card data goes from the browser to Stripe only. */
function StripeSetupForm({ intent, onSaved, onError }: { intent: SetupIntent; onSaved: () => void; onError: (message: string) => void }) {
  const { t } = useTranslation();
  const mountRef = useRef<HTMLDivElement>(null);
  const [stripe, setStripe] = useState<StripeClient | null>(null);
  const [elements, setElements] = useState<ReturnType<StripeClient['elements']> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let element: { destroy(): void } | null = null;
    let active = true;
    loadStripe(intent.publishableKey)
      .then((client) => {
        if (!active || !mountRef.current) return;
        const group = client.elements({ clientSecret: intent.clientSecret });
        const payment = group.create('payment');
        payment.mount(mountRef.current);
        element = payment;
        setStripe(client);
        setElements(group);
      })
      .catch((error: unknown) => onError(error instanceof Error ? error.message : String(error)));
    return () => {
      active = false;
      element?.destroy();
    };
  }, [intent, onError]);

  async function save() {
    if (!stripe || !elements) return;
    setSaving(true);
    const result = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
      confirmParams: { return_url: `${window.location.origin}/app/billing?card=saved` },
    });
    setSaving(false);
    if (result.error) onError(result.error.message ?? t('billing.payment.panel.failed'));
    else onSaved();
  }

  return (
    <div className="space-y-4">
      <div ref={mountRef} className="min-h-[120px]" data-testid="stripe-setup-element">
        {!elements && <div className="flex items-center justify-center py-8"><Spinner size="sm" /></div>}
      </div>
      <Button onClick={() => void save()} disabled={!elements || saving} className="w-full">
        {saving ? t('billing.payment.panel.saving') : t('billing.payment.panel.save')}
      </Button>
    </div>
  );
}

/** Stripe keys missing on the server is a setup issue, not a card problem: say so plainly. */
function panelError(error: unknown, t: (key: string) => string): string {
  const code = (error as { response?: { data?: { code?: string } } }).response?.data?.code;
  return code === 'billing_not_configured' ? t('billing.payment.panel.notConfigured') : apiErrorMessage(error);
}

export function PaymentMethodPanel({ open, onClose, method }: { open: boolean; onClose: () => void; method: PaymentMethod | null | undefined }) {
  const { t } = useTranslation();
  const billing = useRepository('billing');
  const queryClient = useQueryClient();
  const [intent, setIntent] = useState<SetupIntent | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // Fresh state every time the panel opens.
  useEffect(() => {
    if (!open) return;
    setIntent(null);
    setError('');
    setSaved(false);
  }, [open]);

  const start = useMutation({
    mutationFn: () => billing.createSetupIntent(),
    onSuccess: (next) => { setError(''); setIntent(next); },
    onError: (next) => setError(panelError(next, t)),
  });
  const portal = useMutation({
    mutationFn: () => billing.openBillingPortal(),
    onSuccess: (url) => { if (!url.startsWith('/')) window.location.assign(url); },
    onError: (next) => setError(panelError(next, t)),
  });

  function onSaved() {
    setIntent(null);
    setSaved(true);
    // Stripe's webhook makes the new card the default a moment later.
    for (const delay of [1500, 4000, 8000]) {
      window.setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['billing', 'payment-method'] }), delay);
    }
  }

  return (
    <Modal isOpen={open} onClose={onClose} title={t('billing.payment.panel.title')} description={t('billing.payment.panel.description')}>
      <div className="space-y-5" data-testid="payment-method-panel">
        {error && <Alert variant="destructive" onClose={() => setError('')}>{error}</Alert>}
        {saved && <Alert variant="success">{t('billing.payment.panel.saved')}</Alert>}

        <section>
          <h3 className="mb-2 text-sm font-medium text-foreground">{t('billing.payment.panel.current')}</h3>
          {method?.last4 ? (
            <CardFace method={method} />
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              <CreditCard size={20} aria-hidden /> {t('billing.payment.none')}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border p-4">
          {intent ? (
            <>
              <h3 className="mb-3 text-sm font-medium text-foreground">{method?.last4 ? t('billing.payment.panel.replace') : t('billing.payment.panel.add')}</h3>
              <StripeSetupForm intent={intent} onSaved={onSaved} onError={setError} />
              <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setIntent(null)}>
                {method?.last4 ? t('billing.payment.panel.keepCurrent') : t('common.cancel')}
              </Button>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{method?.last4 ? t('billing.payment.panel.replace') : t('billing.payment.panel.add')}</div>
                <div className="text-xs text-muted-foreground">{t('billing.payment.panel.replaceHint')}</div>
              </div>
              <Button onClick={() => start.mutate()} disabled={start.isPending} className="shrink-0 gap-1.5 whitespace-nowrap">
                {start.isPending ? <Spinner size="sm" /> : method?.last4 ? <RefreshCw size={15} aria-hidden /> : <Plus size={15} aria-hidden />}
                {method?.last4 ? t('billing.payment.panel.replace') : t('billing.payment.panel.add')}
              </Button>
            </div>
          )}
        </section>

        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Lock size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>{t('billing.payment.panel.secure')}</span>
        </div>

        <div className="flex justify-between gap-2 border-t border-border pt-4">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => portal.mutate()} disabled={portal.isPending}>
            <ExternalLink size={14} aria-hidden /> {t('billing.payment.panel.portal')}
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>{t('common.close')}</Button>
        </div>
      </div>
    </Modal>
  );
}
