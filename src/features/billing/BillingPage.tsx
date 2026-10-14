import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CreditCard, Download, Plus } from 'lucide-react';
import { useRepository, type Plan, type TopupIntent } from '@/lib/data';
import { apiErrorMessage } from '@/lib/api/http';
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Input, Modal, Switch } from '@/shared/components';
import { loadStripe, type StripeClient } from '@/features/billing/stripe';

const usd = (cents: number, currency = 'USD') =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
const credits = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);

/** Mounts Stripe's Payment Element for a top-up PaymentIntent and confirms it. */
function StripePaymentForm({ intent, onDone, onError }: { intent: TopupIntent; onDone: () => void; onError: (m: string) => void }) {
  const { t } = useTranslation();
  const mountRef = useRef<HTMLDivElement>(null);
  const [stripe, setStripe] = useState<StripeClient | null>(null);
  const [elements, setElements] = useState<ReturnType<StripeClient['elements']> | null>(null);
  const [paying, setPaying] = useState(false);

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
      .catch((err: unknown) => onError(err instanceof Error ? err.message : String(err)));
    return () => {
      active = false;
      element?.destroy();
    };
  }, [intent, onError]);

  async function pay() {
    if (!stripe || !elements) return;
    setPaying(true);
    const result = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: { return_url: `${window.location.origin}/app/billing?topup=success` },
    });
    setPaying(false);
    if (result.error) onError(result.error.message ?? t('billing.topup.failed'));
    else onDone();
  }

  return (
    <div className="space-y-4">
      <div ref={mountRef} data-testid="stripe-payment-element" />
      <Button onClick={() => void pay()} disabled={!elements || paying} className="w-full">
        {paying ? t('common.loading') : t('billing.topup.payNow')}
      </Button>
    </div>
  );
}

export function BillingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const billing = useRepository('billing');
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showTopup, setShowTopup] = useState(false);
  const [topupAmount, setTopupAmount] = useState('10');
  const [intent, setIntent] = useState<TopupIntent | null>(null);
  const [threshold, setThreshold] = useState('');
  const [limit, setLimit] = useState('');

  const plans = useQuery({ queryKey: ['billing', 'plans'], queryFn: () => billing.getPlans() });
  const subscription = useQuery({ queryKey: ['billing', 'subscription'], queryFn: () => billing.getSubscription() });
  const wallet = useQuery({ queryKey: ['billing', 'wallet'], queryFn: () => billing.getWallet() });
  const usage = useQuery({ queryKey: ['billing', 'usage'], queryFn: () => billing.getUsage() });
  const invoices = useQuery({ queryKey: ['billing', 'invoices'], queryFn: () => billing.listInvoices() });
  const paymentMethod = useQuery({ queryKey: ['billing', 'payment-method'], queryFn: () => billing.getPaymentMethod() });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['billing'] });
  const fail = (err: unknown) => {
    setSuccess('');
    setError(apiErrorMessage(err));
  };
  const flash = (message: string) => {
    setError('');
    setSuccess(message);
  };

  // Back from Stripe Checkout / a redirecting payment method.
  useEffect(() => {
    const checkout = searchParams.get('checkout');
    const topup = searchParams.get('topup');
    if (!checkout && !topup) return;
    if (checkout === 'success') flash(t('billing.checkout.returned'));
    if (checkout === 'cancelled') setError(t('billing.checkout.cancelled'));
    if (topup === 'success') flash(t('billing.topup.processing'));
    setSearchParams({}, { replace: true });
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!wallet.data) return;
    setThreshold(String(wallet.data.autoTopupThreshold ?? 0));
    setLimit(wallet.data.monthlySpendingLimit == null ? '' : String(wallet.data.monthlySpendingLimit));
  }, [wallet.data]);

  const checkout = useMutation({
    mutationFn: (plan: Plan) => billing.createCheckout(plan.slug, 'month'),
    onSuccess: ({ checkoutUrl }) => {
      if (checkoutUrl.startsWith('/')) {
        void navigate(checkoutUrl);
        void refresh();
      } else window.location.assign(checkoutUrl);
    },
    onError: fail,
  });
  const portal = useMutation({
    mutationFn: () => billing.openBillingPortal(),
    onSuccess: (url) => (url.startsWith('/') ? void navigate(url) : window.location.assign(url)),
    onError: fail,
  });
  const cancel = useMutation({ mutationFn: () => billing.cancelSubscription(), onSuccess: refresh, onError: fail });
  const reactivate = useMutation({ mutationFn: () => billing.reactivate(), onSuccess: refresh, onError: fail });
  const topup = useMutation({
    mutationFn: (amount: number) => billing.topup(amount),
    onSuccess: (next) => {
      if (next.clientSecret && next.publishableKey) setIntent(next);
      else {
        // Demo mode applies the payment immediately.
        setShowTopup(false);
        flash(t('billing.topup.success'));
        void refresh();
      }
    },
    onError: fail,
  });
  const autoRecharge = useMutation({
    mutationFn: (enabled: boolean) => billing.setAutoRecharge(enabled, Number(threshold) || 0),
    onSuccess: () => {
      void refresh();
      flash(t('billing.wallet.saved'));
    },
    onError: fail,
  });
  const spending = useMutation({
    mutationFn: () => billing.setSpendingLimit(limit.trim() === '' ? null : Number(limit)),
    onSuccess: () => {
      void refresh();
      flash(t('billing.wallet.saved'));
    },
    onError: fail,
  });
  const downloadInvoice = useMutation({
    mutationFn: async (id: string) => {
      const blob = await billing.downloadInvoice(id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    onError: fail,
  });

  const sub = subscription.data;
  const currentSlug = sub?.isActive ? sub.plan : 'free';
  const available = wallet.data ? wallet.data.balance - wallet.data.reservedBalance : 0;
  const amount = Number(topupAmount);
  const loadError = [plans, wallet, usage].find((q) => q.isError)?.error;

  return (
    <section className="workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{t('billing.eyebrow')}</p>
          <h1 className="text-foreground">{t('billing.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('billing.subtitle')}</p>
        </div>
        <Button onClick={() => { setIntent(null); setShowTopup(true); }} className="gap-1.5">
          <Plus size={16} /> {t('billing.addCredits')}
        </Button>
      </header>

      {error && <Alert variant="destructive" className="mb-4" onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert variant="success" className="mb-4" onClose={() => setSuccess('')}>{success}</Alert>}
      {loadError && <Alert variant="destructive" className="mb-4">{apiErrorMessage(loadError)}</Alert>}

      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">{t('billing.summary.currentPlan')}</div>
            <div className="text-2xl font-semibold text-foreground" data-testid="current-plan">
              {sub?.planName ?? plans.data?.find((p) => p.slug === currentSlug)?.name ?? '—'}
            </div>
            {sub?.cancelAtPeriodEnd && <div className="text-xs text-muted-foreground mt-1">{t('billing.subscription.endsAtPeriodEnd')}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">{t('billing.summary.availableCredits')}</div>
            <div className="text-2xl font-semibold text-foreground" data-testid="available-credits">
              {wallet.data ? credits(available) : '—'}
            </div>
            {!!wallet.data?.reservedBalance && (
              <div className="text-xs text-muted-foreground mt-1">{t('billing.wallet.reserved', { amount: credits(wallet.data.reservedBalance) })}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">{t('billing.summary.renewsOn')}</div>
            <div className="text-2xl font-semibold text-foreground">
              {sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : '—'}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{sub ? t('billing.summary.renewsHelper') : t('billing.subscription.freeMonthly')}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground">{t('billing.usage.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-foreground mb-3">
            {t('billing.usage.thisMonth', { amount: credits(usage.data?.totalCredits ?? 0) })}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="usage-breakdown">
            {(['chat', 'images', 'documents', 'agent'] as const).map((key) => (
              <div key={key} className="rounded-md border border-border p-3">
                <div className="text-xs uppercase text-muted-foreground">{t(`billing.usage.types.${key}`)}</div>
                <div className="text-lg font-semibold text-foreground">{credits(usage.data?.byType[key] ?? 0)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="mb-8">
        <h2 className="text-lg font-semibold text-foreground">{t('billing.plans.title')}</h2>
        <p className="text-sm text-muted-foreground mb-4">{t('billing.plans.allInclude')}</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-testid="plan-grid">
          {(plans.data ?? []).map((plan) => {
            const isCurrent = plan.slug === currentSlug;
            const isFree = plan.priceCents === 0;
            return (
              <Card key={plan.id} className={isCurrent ? 'border-primary' : plan.isPopular ? 'border-primary/50' : ''}>
                <CardContent className="pt-6 flex h-full flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
                    {isCurrent && <span className="text-xs font-medium text-primary">{t('billing.plans.ribbonCurrent')}</span>}
                  </div>
                  <p className="text-sm text-muted-foreground">{plan.description || t('billing.plans.fallbackDescription')}</p>
                  <div className="text-2xl font-bold text-foreground">
                    {usd(plan.priceCents, plan.currency)}
                    <span className="text-sm font-normal text-muted-foreground">{t('billing.plans.perMonth')}</span>
                  </div>
                  <ul className="flex-1 space-y-1 text-sm text-foreground/80">
                    {(plan.features.length ? plan.features : [t('billing.plans.fallbackFeature1', { credits: credits(plan.monthlyCredits) })]).map((feature) => (
                      <li key={feature}>• {feature}</li>
                    ))}
                  </ul>
                  <Button
                    variant={isCurrent ? 'outline' : 'primary'}
                    disabled={isCurrent || isFree || checkout.isPending}
                    onClick={() => checkout.mutate(plan)}
                  >
                    {isCurrent ? t('billing.plans.currentCta') : t('billing.plans.chooseCta', { name: plan.name })}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
        {sub?.isActive && (
          <div className="mt-4 flex gap-3">
            {sub.cancelAtPeriodEnd ? (
              <Button variant="outline" onClick={() => reactivate.mutate()} disabled={reactivate.isPending}>{t('billing.subscription.reactivate')}</Button>
            ) : (
              <Button variant="outline" onClick={() => confirm(t('billing.subscription.cancelConfirm')) && cancel.mutate()} disabled={cancel.isPending}>
                {t('billing.subscription.cancel')}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">{t('billing.payment.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 text-sm text-foreground">
              <CreditCard size={18} />
              {paymentMethod.data?.last4
                ? `${paymentMethod.data.brand ?? ''} •••• ${paymentMethod.data.last4}`
                : t('billing.payment.none')}
            </div>
            <Button variant="outline" size="sm" onClick={() => portal.mutate()} disabled={portal.isPending}>
              {t('billing.payment.manage')}
            </Button>
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">{t('billing.wallet.autoRecharge')}</div>
                  <div className="text-xs text-muted-foreground">{t('billing.wallet.autoRechargeDesc')}</div>
                </div>
                <Switch
                  checked={!!wallet.data?.autoTopupEnabled}
                  onCheckedChange={(enabled: boolean) => autoRecharge.mutate(enabled)}
                  aria-label={t('billing.wallet.autoRecharge')}
                />
              </div>
              <div className="flex items-end gap-3">
                <Input label={t('billing.wallet.threshold')} type="number" min={0} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
                <Input label={t('billing.wallet.spendingLimit')} type="number" min={0} value={limit} placeholder={t('billing.wallet.noLimit')} onChange={(e) => setLimit(e.target.value)} />
                <Button variant="outline" size="sm" onClick={() => spending.mutate()} disabled={spending.isPending}>{t('common.saveChanges')}</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">{t('billing.invoices.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            {(invoices.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('billing.invoices.empty')}</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="pb-2 font-medium">{t('billing.invoices.date')}</th>
                    <th className="pb-2 font-medium">{t('billing.invoices.description')}</th>
                    <th className="pb-2 font-medium">{t('billing.invoices.amount')}</th>
                    <th className="pb-2 font-medium">{t('billing.invoices.status')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(invoices.data ?? []).map((invoice) => (
                    <tr key={invoice.id} className="border-t border-border">
                      <td className="py-2">{new Date(invoice.date).toLocaleDateString()}</td>
                      <td className="py-2">{invoice.description || invoice.number}</td>
                      <td className="py-2">{usd(invoice.amountCents, invoice.currency)}</td>
                      <td className="py-2 capitalize">{invoice.status}</td>
                      <td className="py-2 text-right">
                        <Button variant="ghost" size="sm" onClick={() => downloadInvoice.mutate(invoice.id)} aria-label={t('billing.invoices.download')}>
                          <Download size={14} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <Modal isOpen={showTopup} onClose={() => setShowTopup(false)} title={t('billing.topup.title')} description={t('billing.topup.description')}>
        {intent ? (
          <StripePaymentForm
            intent={intent}
            onError={setError}
            onDone={() => {
              setShowTopup(false);
              setIntent(null);
              flash(t('billing.topup.processing'));
              void refresh();
            }}
          />
        ) : (
          <div className="space-y-4">
            <Input label={t('billing.topup.amountLabel')} type="number" min={1} step="1" value={topupAmount} onChange={(e) => setTopupAmount(e.target.value)} />
            <div className="text-sm text-muted-foreground">
              {t('billing.topup.estimatedCredits')}: {Number.isFinite(amount) && amount > 0 && wallet.data ? credits(amount / (wallet.data.creditValueUsd || 0.01)) : '—'}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowTopup(false)}>{t('common.cancel')}</Button>
              <Button
                disabled={topup.isPending || !(Number.isFinite(amount) && amount >= 1)}
                onClick={() => topup.mutate(amount)}
              >
                {topup.isPending ? t('common.loading') : t('billing.topup.confirm', { amount: amount || 0 })}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
