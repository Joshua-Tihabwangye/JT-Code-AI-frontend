import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Spinner, Alert, Input, Modal, Select, PhoneNumberInput } from '@/shared/components';
import { formatCents } from '@/features/billing/store';
import { formatDate } from '@/shared/utils';
import { useBillingStore, type PaymentMethod, type PaymentMethodType, type Plan } from '@/features/billing/store';
import { COUNTRY_METADATA, getCountryMetadata } from '@/features/auth/lib/countryMetadata';
import {
  Crown,
  Coins,
  CalendarDays,
  CreditCard,
  Check,
  Plus,
  ShieldCheck,
  Smartphone,
  Wallet,
} from 'lucide-react';

function methodLabelKey(type: PaymentMethodType): string {
  return `billing.payment.methods.${type}`;
}

export function BillingPage() {
  const { t, i18n } = useTranslation();
  const plans = useBillingStore((s) => s.plans);
  const subscription = useBillingStore((s) => s.subscription);
  const walletBalance = useBillingStore((s) => s.walletBalance);
  const usageTotal = useBillingStore((s) => s.usageTotal);
  const invoices = useBillingStore((s) => s.invoices);
  const paymentMethods = useBillingStore((s) => s.paymentMethods);
  const country = useBillingStore((s) => s.country);
  const selectPlan = useBillingStore((s) => s.selectPlan);
  const topUp = useBillingStore((s) => s.topUp);
  const setCountry = useBillingStore((s) => s.setCountry);
  const addPaymentMethod = useBillingStore((s) => s.addPaymentMethod);
  const setDefaultPaymentMethod = useBillingStore((s) => s.setDefaultPaymentMethod);

  const [showTopupDialog, setShowTopupDialog] = useState(false);
  const [showInvoicesDialog, setShowInvoicesDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [checkoutPlanId, setCheckoutPlanId] = useState<string | null>(null);
  const [topupAmount, setTopupAmount] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [method, setMethod] = useState<PaymentMethodType | 'mobile' | null>(null);
  const [mobileProvider, setMobileProvider] = useState<'mtn' | 'airtel'>('mtn');
  const [phone, setPhone] = useState('');
  const [processing, setProcessing] = useState(false);

  const currentPlan = plans.find((p) => p.id === subscription?.planId);
  const limit = currentPlan?.monthlyCredits ?? 0;
  const usagePercent = limit > 0 ? Math.min(100, Math.max(0, (usageTotal / limit) * 100)) : 0;
  const remainingCredits = Math.max(0, limit - usageTotal);

  const countryOptions = COUNTRY_METADATA.map((c) => ({ value: c.code, label: `${c.flag} ${c.name}` }));

  const openCheckout = (planId: string) => {
    setCheckoutPlanId(planId);
    setMethod(null);
    setMobileProvider('mtn');
    setPhone('');
    setProcessing(false);
  };

  const closeCheckout = () => setCheckoutPlanId(null);

  const handlePay = () => {
    if (!checkoutPlanId) return;
    const plan = plans.find((p) => p.id === checkoutPlanId);
    if (!plan) return;
    if (method === 'mobile' && !phone.trim()) {
      setError(t('billing.checkout.enterPhone'));
      return;
    }
    setError('');
    setProcessing(true);
    setTimeout(() => {
      selectPlan(plan.id);
      setProcessing(false);
      closeCheckout();
      setSuccess(t('billing.checkout.activated', { name: plan.name }));
      setTimeout(() => setSuccess(''), 3000);
    }, 1300);
  };

  const handleSavePaymentMethod = () => {
    if (method === 'mobile' && !phone.trim()) {
      setError(t('billing.checkout.enterPhone'));
      return;
    }
    if (!method) return;
    const finalType: PaymentMethodType = method === 'mobile' ? mobileProvider : method;
    const pm: PaymentMethod = {
      id: `pm-${Date.now()}`,
      type: finalType,
      label: t(methodLabelKey(finalType)),
      detail: finalType === 'mtn' || finalType === 'airtel' ? phone : undefined,
      default: paymentMethods.length === 0,
    };
    addPaymentMethod(pm);
    if (pm.default) setDefaultPaymentMethod(pm.id);
    setShowPaymentDialog(false);
    setMethod(null);
    setPhone('');
    setSuccess(t('billing.payment.savedToast'));
    setTimeout(() => setSuccess(''), 3000);
  };

  const checkoutPlan = checkoutPlanId ? plans.find((p) => p.id === checkoutPlanId) : null;
  const isUganda = country === 'UG';

  const summaryCards = [
    {
      icon: Crown,
      label: t('billing.summary.currentPlan'),
      value: subscription?.planName || currentPlan?.name || 'Free',
      action: t('billing.summary.managePlan'),
      actionKey: 'plan',
      tint: 'text-primary',
      bg: 'bg-accent',
    },
    {
      icon: Coins,
      label: t('billing.summary.availableCredits'),
      value: `${walletBalance.toLocaleString(i18n.language)} ${t('common.creditsUnit')}`,
      action: t('billing.summary.addCreditsAction'),
      actionKey: 'credits',
      tint: 'text-primary',
      bg: 'bg-accent',
    },
    {
      icon: CalendarDays,
      label: t('billing.summary.renewsOn'),
      value: subscription ? formatDate(subscription.currentPeriodEnd, undefined, i18n.language) : '—',
      helper: subscription ? t('billing.summary.renewsHelper') : undefined,
      tint: 'text-primary',
      bg: 'bg-accent',
    },
  ];

  return (
    <section className="workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{t('billing.eyebrow')}</p>
          <h1 className="text-foreground">{t('billing.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('billing.subtitle')}</p>
        </div>
        <Button
          onClick={() => setShowTopupDialog(true)}
          className="gap-1.5"
        >
          <Plus size={16} />
          {t('billing.addCredits')}
        </Button>
      </header>

      {error && (
        <Alert variant="destructive" className="mb-4" onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" className="mb-4" onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        {summaryCards.map((card) => (
          <Card key={card.label} className="rounded-xl border-border/60">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <span className="text-sm text-muted-foreground">{card.label}</span>
                <div className={`p-2 rounded-lg ring-1 ring-current/10 ${card.bg} ${card.tint}`}>
                  <card.icon size={18} />
                </div>
              </div>
              <div className="text-xl font-semibold text-foreground">{card.value}</div>
              {card.helper && <div className="text-xs text-muted-foreground mt-1">{card.helper}</div>}
              {card.action && (
                <button
                  type="button"
                  className="mt-3 inline-flex items-center gap-1 rounded-sm text-sm font-semibold text-primary transition-opacity hover:opacity-75"
                  onClick={() => {
                    if (card.actionKey === 'credits') setShowTopupDialog(true);
                    else if (card.actionKey === 'plan') {
                      document.getElementById('billing-plans')?.scrollIntoView({ behavior: 'smooth' });
                    }
                  }}
                >
                  {card.action}
                </button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Usage bar */}
      <Card className="mb-8 rounded-xl border-border/60">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-medium text-foreground">{t('billing.usage.title')}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {t('billing.usage.usedOf', {
                  used: usageTotal.toLocaleString(i18n.language),
                  limit: limit.toLocaleString(i18n.language),
                })}
              </div>
            </div>
            <div className="text-sm font-semibold text-foreground">
              {t('billing.usage.left', { amount: remainingCredits.toLocaleString(i18n.language) })}
            </div>
          </div>
          <div
            className="h-2.5 w-full rounded-full bg-secondary overflow-hidden shadow-inner"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(usagePercent)}
            aria-label={t('billing.usage.title')}
          >
            <div
              className="billing-progress-fill h-full rounded-full shadow-[0_0_10px_var(--glow)] transition-all duration-700 ease-out"
              style={{ width: `${usagePercent}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Plans */}
      <div id="billing-plans" className="mb-8">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-foreground">{t('billing.plans.title')}</h2>
          <div className="text-xs text-muted-foreground hidden sm:flex items-center gap-1">
            <ShieldCheck size={12} />
            {t('billing.plans.allInclude')}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {plans.map((plan: Plan) => {
            const isCurrent = subscription?.planId === plan.id;
            const isCheckoutSelected = checkoutPlanId === plan.id;
            const highlighted = isCurrent || isCheckoutSelected;
            const features = t(`billing.plans.features.${plan.slug}`, { returnObjects: true }) as string[];
            const featureList = Array.isArray(features) && features.length > 0
              ? features
              : [
                  t('billing.plans.fallbackFeature1', { credits: plan.monthlyCredits.toLocaleString(i18n.language) }),
                  t('billing.plans.fallbackFeature2'),
                ];
            const ctaText = isCurrent ? t('billing.plans.currentCta') : t('billing.plans.chooseCta', { name: plan.name });
            const ribbonText = isCurrent
              ? t('billing.plans.ribbonCurrent')
              : isCheckoutSelected
                ? t('billing.plans.ribbonSelected')
                : null;
            return (
              <Card
                key={plan.id}
                interactive={!highlighted}
                className={`relative flex flex-col rounded-xl ${
                  highlighted ? 'border-2 border-primary shadow-lg ring-4 ring-primary/10' : 'border-border/60'
                }`}
              >
                {ribbonText && (
                  <span className="absolute -top-3 end-3 z-10 inline-flex items-center rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary-foreground shadow-md">
                    {ribbonText}
                  </span>
                )}
                <CardHeader className="pb-3 pt-6">
                  <CardTitle className="text-base font-semibold text-foreground">{plan.name}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t(`billing.plans.descriptions.${plan.slug}`, { defaultValue: t('billing.plans.fallbackDescription') })}
                  </p>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <div className="flex items-baseline gap-1 mb-5">
                    <span className="text-3xl font-bold text-foreground tabular-nums">
                      {plan.custom ? t('billing.plans.customPrice') : formatCents(plan.priceCents)}
                    </span>
                    {!plan.custom && <span className="text-sm text-muted-foreground">{t('billing.plans.perMonth')}</span>}
                  </div>
                  <ul className="space-y-3 mb-6 flex-1">
                    {featureList.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Check size={14} className="mt-0.5 text-primary shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full rounded-md"
                    variant={isCurrent ? 'outline' : highlighted ? 'default' : 'outline'}
                    disabled={isCurrent}
                    onClick={() => !isCurrent && openCheckout(plan.id)}
                  >
                    {ctaText}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Bottom grid */}
      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <Card className="rounded-xl border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-foreground">{t('billing.payment.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">{t('billing.payment.billingCountry')}</label>
              <Select options={countryOptions} value={country} onChange={(e) => setCountry(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1.5">
                {isUganda ? t('billing.payment.ugandaHint') : t('billing.payment.otherHint')}
              </p>
            </div>
            {paymentMethods.map((pm) => (
              <div
                key={pm.id}
                className="flex items-center gap-4 p-3 rounded-xl border border-border bg-card transition-colors hover:bg-muted/40"
              >
                <div className="p-2.5 rounded-lg bg-accent text-primary">
                  {pm.type === 'paypal' ? <Wallet size={22} /> : pm.type === 'mtn' || pm.type === 'airtel' ? <Smartphone size={22} /> : <CreditCard size={22} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{pm.label}</span>
                    {pm.default && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{t('common.default')}</Badge>}
                  </div>
                  {pm.detail && <div className="text-sm text-muted-foreground">{pm.detail}</div>}
                </div>
                <Button variant="outline" size="sm" className="rounded-md" onClick={() => setDefaultPaymentMethod(pm.id)} disabled={pm.default}>
                  {t('billing.payment.makeDefault')}
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="rounded-md" onClick={() => { setMethod(null); setPhone(''); setShowPaymentDialog(true); }}>
              {t('billing.payment.addMethod')}
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold text-foreground">{t('billing.invoices.title')}</CardTitle>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-sm text-sm font-semibold text-primary transition-opacity hover:opacity-75"
              onClick={() => setShowInvoicesDialog(true)}
            >
              {t('billing.invoices.viewAll')} <span>→</span>
            </button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-start text-muted-foreground border-b">
                    <th className="pb-2 font-medium text-start">{t('billing.invoices.date')}</th>
                    <th className="pb-2 font-medium text-start">{t('billing.invoices.description')}</th>
                    <th className="pb-2 font-medium text-start">{t('billing.invoices.amount')}</th>
                    <th className="pb-2 font-medium text-start">{t('billing.invoices.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.slice(0, 3).map((invoice) => (
                    <tr key={invoice.id} className="border-b last:border-0 transition-colors hover:bg-muted/40">
                      <td className="py-3 text-muted-foreground">{invoice.date}</td>
                      <td className="py-3 font-medium text-foreground">{invoice.description}</td>
                      <td className="py-3 text-foreground tabular-nums">{invoice.amount}</td>
                      <td className="py-3"><Badge variant="success" className="text-xs">{invoice.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Topup dialog */}
      <Modal isOpen={showTopupDialog} onClose={() => setShowTopupDialog(false)} title={t('billing.topup.title')} description={t('billing.topup.description')}>
        <div className="space-y-4">
          <Input
            label={t('billing.topup.amountLabel')}
            type="number"
            min="5"
            max="1000"
            step="5"
            placeholder="50"
            value={topupAmount}
            onChange={(e) => setTopupAmount(e.target.value)}
          />
          <div className="p-4 rounded-xl bg-secondary border border-border/60">
            <div className="text-sm text-muted-foreground">{t('billing.topup.estimatedCredits')}</div>
            <div className="text-2xl font-bold text-primary mt-1 tabular-nums">
              {topupAmount && !Number.isNaN(Number(topupAmount))
                ? (Number(topupAmount) / 0.01).toLocaleString(i18n.language)
                : '—'}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowTopupDialog(false)}>{t('common.cancel')}</Button>
            <Button
              onClick={() => {
                const amt = Number(topupAmount);
                if (!amt || amt <= 0) {
                  setError(t('billing.topup.invalidAmount'));
                  return;
                }
                topUp(amt);
                setShowTopupDialog(false);
                setTopupAmount('');
                setSuccess(t('billing.topup.success'));
                setTimeout(() => setSuccess(''), 3000);
              }}
            >
              {t('billing.topup.confirm', { amount: topupAmount || '' })}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Invoices dialog */}
      <Modal isOpen={showInvoicesDialog} onClose={() => setShowInvoicesDialog(false)} title={t('billing.invoices.allTitle')} description={t('billing.invoices.allSubtitle')}>
        <div className="space-y-4">
          {invoices.map((invoice) => (
            <div key={invoice.id} className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-foreground">{invoice.description}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {invoice.id} · {invoice.date} · {invoice.paymentMethod} · {invoice.country}
                  </div>
                </div>
                <div className="text-end">
                  <div className="font-semibold text-foreground tabular-nums">{invoice.amount}</div>
                  <Badge variant="success" className="text-xs mt-1">{invoice.status}</Badge>
                </div>
              </div>
              {invoice.items.length > 0 && (
                <table className="w-full text-sm mt-3">
                  <tbody>
                    {invoice.items.map((item, i) => (
                      <tr key={i} className="text-muted-foreground">
                        <td className="py-1">{item.description}</td>
                        <td className="py-1 text-end text-foreground tabular-nums">{item.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      </Modal>

      {/* Payment method dialog */}
      <Modal isOpen={showPaymentDialog} onClose={() => setShowPaymentDialog(false)} title={t('billing.payment.addMethod')} description={t('billing.topup.description')}>
        <div className="space-y-4">
          <PaymentPicker country={country} method={method} setMethod={setMethod} mobileProvider={mobileProvider} setMobileProvider={setMobileProvider} phone={phone} setPhone={setPhone} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowPaymentDialog(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSavePaymentMethod}>{t('billing.payment.addMethod')}</Button>
          </div>
        </div>
      </Modal>

      {/* Checkout dialog */}
      <Modal isOpen={checkoutPlanId !== null} onClose={closeCheckout} title={t('billing.checkout.title')} description={checkoutPlan ? t('billing.checkout.planSuffix', { name: checkoutPlan.name }) : ''}>
        {checkoutPlan && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
              <div>
                <div className="font-semibold text-foreground">{t('billing.checkout.planSuffix', { name: checkoutPlan.name })}</div>
                <div className="text-xs text-muted-foreground">{checkoutPlan.custom ? t('billing.checkout.customPricing') : t('billing.checkout.billedMonthly')}</div>
              </div>
              <div className="text-lg font-bold text-foreground tabular-nums">{checkoutPlan.custom ? t('billing.plans.customPrice') : formatCents(checkoutPlan.priceCents)}</div>
            </div>
            <PaymentPicker country={country} method={method} setMethod={setMethod} mobileProvider={mobileProvider} setMobileProvider={setMobileProvider} phone={phone} setPhone={setPhone} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={closeCheckout}>{t('common.cancel')}</Button>
              <Button onClick={handlePay} disabled={processing || !method}>
                {processing ? <Spinner size="sm" /> : t('billing.checkout.pay', { amount: checkoutPlan.custom ? '' : formatCents(checkoutPlan.priceCents) })}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}

function PaymentPicker({
  country,
  method,
  setMethod,
  mobileProvider,
  setMobileProvider,
  phone,
  setPhone,
}: {
  country: string;
  method: PaymentMethodType | 'mobile' | null;
  setMethod: (m: PaymentMethodType | 'mobile' | null) => void;
  mobileProvider: 'mtn' | 'airtel';
  setMobileProvider: (m: 'mtn' | 'airtel') => void;
  phone: string;
  setPhone: (p: string) => void;
}) {
  const { t } = useTranslation();
  const isUganda = country === 'UG';
  const options: { value: PaymentMethodType | 'mobile'; label: string; icon: typeof CreditCard }[] = isUganda
    ? [
        { value: 'card', label: t('billing.payment.pickerCard'), icon: CreditCard },
        { value: 'mobile', label: t('billing.payment.pickerMobileMoney'), icon: Smartphone },
      ]
    : [
        { value: 'card', label: t('billing.payment.pickerCard'), icon: CreditCard },
        { value: 'paypal', label: t('billing.payment.methods.paypal'), icon: Wallet },
      ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setMethod(opt.value)}
            aria-pressed={method === opt.value}
            className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-all duration-150 active:scale-[0.98] ${
              method === opt.value
                ? 'border-primary bg-accent text-accent-foreground ring-2 ring-ring/20'
                : 'border-border hover:bg-secondary hover:border-ring/40'
            }`}
          >
            <opt.icon size={16} />
            {opt.label}
          </button>
        ))}
      </div>

      {method === 'mobile' && (
        <div className="alert-enter space-y-3 rounded-lg border border-border p-3">
          <div className="grid grid-cols-2 gap-2">
            {(['mtn', 'airtel'] as const).map((provider) => (
              <button
                key={provider}
                type="button"
                onClick={() => setMobileProvider(provider)}
                aria-pressed={mobileProvider === provider}
                className={`rounded-lg border px-3 py-2 text-sm transition-all duration-150 active:scale-[0.98] ${
                  mobileProvider === provider
                    ? 'border-primary bg-accent text-accent-foreground ring-2 ring-ring/20'
                    : 'border-border hover:bg-secondary hover:border-ring/40'
                }`}
              >
                {provider === 'mtn' ? 'MTN' : 'Airtel'}
              </button>
            ))}
          </div>
          <PhoneNumberInput
            label={t('billing.payment.phoneLabel')}
            dialCode={getCountryMetadata(country)?.dialCode}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      )}

      {method === 'card' && (
        <div className="alert-enter space-y-3 rounded-lg border border-border p-3">
          <Input label={t('billing.payment.cardNumberLabel')} placeholder="4242 4242 4242 4242" />
          <div className="grid grid-cols-2 gap-3">
            <Input label={t('billing.payment.expiryLabel')} placeholder="MM / YY" />
            <Input label={t('billing.payment.cvcLabel')} placeholder="123" />
          </div>
        </div>
      )}
    </div>
  );
}
