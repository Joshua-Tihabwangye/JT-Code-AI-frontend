import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarDays, Check, Coins, CreditCard, Crown, Download, Plus, ShieldCheck } from 'lucide-react';
import { useRepository, type Plan, type TopupIntent } from '@/lib/data';
import { apiErrorMessage } from '@/lib/api/http';
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Modal, Switch } from '@/shared/components';
import { loadStripe, type StripeClient } from '@/features/billing/stripe';

const usd = (cents: number, currency = 'USD') => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
const credits = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);

function StripePaymentForm({ intent, onDone, onError }: { intent: TopupIntent; onDone: () => void; onError: (message: string) => void }) {
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
      .catch((error: unknown) => onError(error instanceof Error ? error.message : String(error)));
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

  return <div className="space-y-4"><div ref={mountRef} data-testid="stripe-payment-element" /><Button onClick={() => void pay()} disabled={!elements || paying} className="w-full">{paying ? t('common.loading') : t('billing.topup.payNow')}</Button></div>;
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
  const [showInvoices, setShowInvoices] = useState(false);
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
  const fail = (nextError: unknown) => { setSuccess(''); setError(apiErrorMessage(nextError)); };
  const flash = (message: string) => { setError(''); setSuccess(message); };

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
      if (checkoutUrl.startsWith('/')) { void navigate(checkoutUrl); void refresh(); }
      else window.location.assign(checkoutUrl);
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
      else { setShowTopup(false); flash(t('billing.topup.success')); void refresh(); }
    },
    onError: fail,
  });
  const autoRecharge = useMutation({
    mutationFn: (enabled: boolean) => billing.setAutoRecharge(enabled, Number(threshold) || 0),
    onSuccess: () => { void refresh(); flash(t('billing.wallet.saved')); },
    onError: fail,
  });
  const spending = useMutation({
    mutationFn: () => billing.setSpendingLimit(limit.trim() === '' ? null : Number(limit)),
    onSuccess: () => { void refresh(); flash(t('billing.wallet.saved')); },
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
  const currentPlan = plans.data?.find((plan) => plan.slug === currentSlug);
  const available = wallet.data ? wallet.data.balance - wallet.data.reservedBalance : 0;
  const amount = Number(topupAmount);
  const usageTotal = usage.data?.totalCredits ?? 0;
  const monthlyCredits = currentPlan?.monthlyCredits ?? 0;
  const usagePercent = monthlyCredits > 0 ? Math.min(100, Math.max(0, (usageTotal / monthlyCredits) * 100)) : 0;
  const remainingCredits = Math.max(0, monthlyCredits - usageTotal);
  const loadError = [plans, wallet, usage].find((query) => query.isError)?.error;
  const summaryCards = [
    { icon: Crown, label: t('billing.summary.currentPlan'), value: sub?.planName ?? currentPlan?.name ?? '—', helper: sub?.cancelAtPeriodEnd ? t('billing.subscription.endsAtPeriodEnd') : undefined, action: t('billing.summary.managePlan'), onClick: () => document.getElementById('billing-plans')?.scrollIntoView({ behavior: 'smooth' }) },
    { icon: Coins, label: t('billing.summary.availableCredits'), value: wallet.data ? credits(available) : '—', helper: wallet.data?.reservedBalance ? t('billing.wallet.reserved', { amount: credits(wallet.data.reservedBalance) }) : undefined, action: t('billing.summary.addCreditsAction'), onClick: () => { setIntent(null); setShowTopup(true); } },
    { icon: CalendarDays, label: t('billing.summary.renewsOn'), value: sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : '—', helper: sub ? t('billing.summary.renewsHelper') : t('billing.subscription.freeMonthly') },
  ];

  return (
    <section className="workspace">
      <header className="workspace-header">
        <div><p className="eyebrow">{t('billing.eyebrow')}</p><h1 className="text-foreground">{t('billing.title')}</h1><p className="text-sm text-muted-foreground mt-1">{t('billing.subtitle')}</p></div>
        <Button onClick={() => { setIntent(null); setShowTopup(true); }} className="gap-1.5"><Plus size={16} /> {t('billing.addCredits')}</Button>
      </header>

      {error && <Alert variant="destructive" className="mb-4" onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert variant="success" className="mb-4" onClose={() => setSuccess('')}>{success}</Alert>}
      {loadError && <Alert variant="destructive" className="mb-4">{apiErrorMessage(loadError)}</Alert>}

      <div className="grid gap-4 md:grid-cols-3 mb-8">
        {summaryCards.map((card) => (
          <Card key={card.label} className="rounded-xl border-border/60">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3"><span className="text-sm text-muted-foreground">{card.label}</span><div className="p-2 rounded-lg ring-1 ring-current/10 bg-accent text-primary"><card.icon size={18} /></div></div>
              <div className="text-xl font-semibold text-foreground" data-testid={card.label === t('billing.summary.currentPlan') ? 'current-plan' : card.label === t('billing.summary.availableCredits') ? 'available-credits' : undefined}>{card.value}</div>
              {card.helper && <div className="text-xs text-muted-foreground mt-1">{card.helper}</div>}
              {card.action && card.onClick && <button type="button" className="mt-3 inline-flex items-center gap-1 rounded-sm text-sm font-semibold text-primary transition-opacity hover:opacity-75" onClick={card.onClick}>{card.action}</button>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mb-8 rounded-xl border-border/60">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3"><div><div className="text-sm font-medium text-foreground">{t('billing.usage.title')}</div><div className="text-xs text-muted-foreground mt-0.5">{t('billing.usage.usedOf', { used: credits(usageTotal), limit: credits(monthlyCredits) })}</div></div><div className="text-sm font-semibold text-foreground">{t('billing.usage.left', { amount: credits(remainingCredits) })}</div></div>
          <div className="h-2.5 w-full rounded-full bg-secondary overflow-hidden shadow-inner" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usagePercent)} aria-label={t('billing.usage.title')}><div className="billing-progress-fill h-full rounded-full shadow-[0_0_10px_var(--glow)] transition-all duration-700 ease-out" style={{ width: `${usagePercent}%` }} /></div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mt-5" data-testid="usage-breakdown">
            {(['chat', 'images', 'documents', 'agent'] as const).map((key) => <div key={key} className="rounded-md border border-border p-3"><div className="text-xs uppercase text-muted-foreground">{t(`billing.usage.types.${key}`)}</div><div className="text-lg font-semibold text-foreground">{credits(usage.data?.byType[key] ?? 0)}</div></div>)}
          </div>
        </CardContent>
      </Card>

      <div id="billing-plans" className="mb-8">
        <div className="flex items-center justify-between mb-5"><h2 className="text-lg font-semibold text-foreground">{t('billing.plans.title')}</h2><div className="text-xs text-muted-foreground hidden sm:flex items-center gap-1"><ShieldCheck size={12} />{t('billing.plans.allInclude')}</div></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-testid="plan-grid">
          {(plans.data ?? []).map((plan) => {
            const isCurrent = plan.slug === currentSlug;
            const features = plan.features.length ? plan.features : [t('billing.plans.fallbackFeature1', { credits: credits(plan.monthlyCredits) })];
            return <Card key={plan.id} interactive={!isCurrent} className={`relative flex flex-col rounded-xl ${isCurrent ? 'border-2 border-primary shadow-lg ring-4 ring-primary/10' : 'border-border/60'}`}>
              {isCurrent && <span className="absolute -top-3 end-3 z-10 inline-flex items-center rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary-foreground shadow-md">{t('billing.plans.ribbonCurrent')}</span>}
              <CardHeader className="pb-3 pt-6"><CardTitle className="text-base font-semibold text-foreground">{plan.name}</CardTitle><p className="text-xs text-muted-foreground mt-1">{plan.description || t('billing.plans.fallbackDescription')}</p></CardHeader>
              <CardContent className="flex-1 flex flex-col"><div className="flex items-baseline gap-1 mb-5"><span className="text-3xl font-bold text-foreground tabular-nums">{usd(plan.priceCents, plan.currency)}</span><span className="text-sm text-muted-foreground">{t('billing.plans.perMonth')}</span></div><ul className="space-y-3 mb-6 flex-1">{features.map((feature) => <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground"><Check size={14} className="mt-0.5 text-primary shrink-0" /><span>{feature}</span></li>)}</ul><Button className="w-full rounded-md" variant={isCurrent ? 'outline' : 'primary'} disabled={isCurrent || plan.priceCents === 0 || checkout.isPending} onClick={() => checkout.mutate(plan)}>{isCurrent ? t('billing.plans.currentCta') : t('billing.plans.chooseCta', { name: plan.name })}</Button></CardContent>
            </Card>;
          })}
        </div>
        {sub?.isActive && <div className="mt-4 flex gap-3">{sub.cancelAtPeriodEnd ? <Button variant="outline" onClick={() => reactivate.mutate()} disabled={reactivate.isPending}>{t('billing.subscription.reactivate')}</Button> : <Button variant="outline" onClick={() => confirm(t('billing.subscription.cancelConfirm')) && cancel.mutate()} disabled={cancel.isPending}>{t('billing.subscription.cancel')}</Button>}</div>}
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <Card className="rounded-xl border-border/60"><CardHeader className="pb-3"><CardTitle className="text-base font-semibold text-foreground">{t('billing.payment.title')}</CardTitle></CardHeader><CardContent className="space-y-4">
          <div className="flex items-center gap-4 p-3 rounded-xl border border-border bg-card"><div className="p-2.5 rounded-lg bg-accent text-primary"><CreditCard size={22} /></div><div className="flex-1 min-w-0"><div className="font-medium text-foreground">{paymentMethod.data?.last4 ? `${paymentMethod.data.brand ?? ''} •••• ${paymentMethod.data.last4}` : t('billing.payment.none')}</div>{paymentMethod.data?.last4 && <div className="text-sm text-muted-foreground">{paymentMethod.data.name}</div>}</div>{paymentMethod.data?.last4 && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{t('common.default')}</Badge>}</div>
          <Button variant="outline" size="sm" className="rounded-md" onClick={() => portal.mutate()} disabled={portal.isPending}>{t('billing.payment.manage')}</Button>
          <div className="border-t border-border pt-4 space-y-3"><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-medium text-foreground">{t('billing.wallet.autoRecharge')}</div><div className="text-xs text-muted-foreground">{t('billing.wallet.autoRechargeDesc')}</div></div><Switch checked={!!wallet.data?.autoTopupEnabled} onCheckedChange={(enabled: boolean) => autoRecharge.mutate(enabled)} aria-label={t('billing.wallet.autoRecharge')} /></div><div className="flex items-end gap-3"><Input label={t('billing.wallet.threshold')} type="number" min={0} value={threshold} onChange={(event) => setThreshold(event.target.value)} /><Input label={t('billing.wallet.spendingLimit')} type="number" min={0} value={limit} placeholder={t('billing.wallet.noLimit')} onChange={(event) => setLimit(event.target.value)} /><Button variant="outline" size="sm" onClick={() => spending.mutate()} disabled={spending.isPending}>{t('common.saveChanges')}</Button></div></div>
        </CardContent></Card>

        <Card className="rounded-xl border-border/60"><CardHeader className="flex flex-row items-center justify-between pb-3"><CardTitle className="text-base font-semibold text-foreground">{t('billing.invoices.title')}</CardTitle><button type="button" className="inline-flex items-center gap-1 rounded-sm text-sm font-semibold text-primary transition-opacity hover:opacity-75" onClick={() => setShowInvoices(true)}>{t('billing.invoices.viewAll')} <span>→</span></button></CardHeader><CardContent>
          {(invoices.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{t('billing.invoices.empty')}</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-start text-muted-foreground border-b"><th className="pb-2 font-medium text-start">{t('billing.invoices.date')}</th><th className="pb-2 font-medium text-start">{t('billing.invoices.description')}</th><th className="pb-2 font-medium text-start">{t('billing.invoices.amount')}</th><th className="pb-2 font-medium text-start">{t('billing.invoices.status')}</th><th /></tr></thead><tbody>{(invoices.data ?? []).slice(0, 3).map((invoice) => <tr key={invoice.id} className="border-b last:border-0 transition-colors hover:bg-muted/40"><td className="py-3 text-muted-foreground">{new Date(invoice.date).toLocaleDateString()}</td><td className="py-3 font-medium text-foreground">{invoice.description || invoice.number}</td><td className="py-3 text-foreground tabular-nums">{usd(invoice.amountCents, invoice.currency)}</td><td className="py-3"><Badge variant={invoice.status === 'paid' ? 'success' : 'secondary'} className="text-xs">{invoice.status}</Badge></td><td className="py-3 text-right"><Button variant="ghost" size="sm" onClick={() => downloadInvoice.mutate(invoice.id)} aria-label={t('billing.invoices.download')}><Download size={14} /></Button></td></tr>)}</tbody></table></div>}
        </CardContent></Card>
      </div>

      <Modal isOpen={showTopup} onClose={() => setShowTopup(false)} title={t('billing.topup.title')} description={t('billing.topup.description')}>
        {intent ? <StripePaymentForm intent={intent} onError={setError} onDone={() => { setShowTopup(false); setIntent(null); flash(t('billing.topup.processing')); void refresh(); }} /> : <div className="space-y-4"><Input label={t('billing.topup.amountLabel')} type="number" min={1} step="1" value={topupAmount} onChange={(event) => setTopupAmount(event.target.value)} /><div className="p-4 rounded-xl bg-secondary border border-border/60"><div className="text-sm text-muted-foreground">{t('billing.topup.estimatedCredits')}</div><div className="text-2xl font-bold text-primary mt-1 tabular-nums">{Number.isFinite(amount) && amount > 0 && wallet.data ? credits(amount / (wallet.data.creditValueUsd || 0.01)) : '—'}</div></div><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setShowTopup(false)}>{t('common.cancel')}</Button><Button disabled={topup.isPending || !(Number.isFinite(amount) && amount >= 1)} onClick={() => topup.mutate(amount)}>{topup.isPending ? t('common.loading') : t('billing.topup.confirm', { amount: amount || 0 })}</Button></div></div>}
      </Modal>

      <Modal isOpen={showInvoices} onClose={() => setShowInvoices(false)} title={t('billing.invoices.allTitle')} description={t('billing.invoices.allSubtitle')}>
        <div className="space-y-3">{(invoices.data ?? []).map((invoice) => <div key={invoice.id} className="flex items-center justify-between gap-4 rounded-xl border border-border p-4"><div><div className="font-semibold text-foreground">{invoice.description || invoice.number}</div><div className="text-xs text-muted-foreground mt-0.5">{new Date(invoice.date).toLocaleDateString()} · {invoice.number}</div></div><div className="flex items-center gap-3"><div className="text-end"><div className="font-semibold text-foreground tabular-nums">{usd(invoice.amountCents, invoice.currency)}</div><Badge variant={invoice.status === 'paid' ? 'success' : 'secondary'} className="text-xs mt-1">{invoice.status}</Badge></div><Button variant="ghost" size="sm" onClick={() => downloadInvoice.mutate(invoice.id)} aria-label={t('billing.invoices.download')}><Download size={14} /></Button></div></div>)}</div>
      </Modal>
    </section>
  );
}
