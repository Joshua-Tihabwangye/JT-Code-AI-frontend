// Minimal Stripe.js loader for confirming credit top-ups (PaymentIntents) with
// the Payment Element. Card data goes from the browser to Stripe only; the API
// creates the intent and grants credits when Stripe's webhook confirms it.

interface StripeElement {
  mount(target: HTMLElement): void;
  destroy(): void;
}

interface StripeElements {
  create(type: 'payment'): StripeElement;
}

export interface StripeClient {
  elements(options: { clientSecret: string }): StripeElements;
  confirmPayment(options: {
    elements: StripeElements;
    redirect: 'if_required';
    confirmParams?: { return_url?: string };
  }): Promise<{ error?: { message?: string }; paymentIntent?: { status: string } }>;
}

declare global {
  interface Window {
    Stripe?: (publishableKey: string) => StripeClient;
  }
}

const STRIPE_JS = 'https://js.stripe.com/v3/';
let loading: Promise<void> | null = null;

function loadStripeScript(): Promise<void> {
  if (window.Stripe) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = STRIPE_JS;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error('Could not load the Stripe payment form. Check your connection.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export async function loadStripe(publishableKey: string): Promise<StripeClient> {
  await loadStripeScript();
  if (!window.Stripe) throw new Error('Stripe is unavailable.');
  return window.Stripe(publishableKey);
}
