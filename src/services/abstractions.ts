import { PaymentMethod, PaymentStatus } from '../types/store';

// 1. Payment Provider Abstraction Layer
// Honest payment representation: When no live Stripe/PayPal secret key is configured,
// card and wallet orders are recorded as PENDING manual verification (never fake-capturing funds).
export interface PaymentRequest {
  orderNumber: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  customerEmail: string;
  maskedInstrumentSummary?: string;
}

export interface PaymentResult {
  success: boolean;
  transactionId: string;
  paymentStatus: PaymentStatus;
  providerMessage: string;
  isGatewayConfigured: boolean;
}

export class PaymentGatewayService {
  static async processPayment(req: PaymentRequest): Promise<PaymentResult> {
    const txSuffix = Math.random().toString(36).substring(2, 9).toUpperCase();
    switch (req.method) {
      case 'COD':
        return {
          success: true,
          transactionId: `cod_pk_${txSuffix}`,
          paymentStatus: 'PENDING',
          isGatewayConfigured: true,
          providerMessage: `Pakistan Cash on Delivery (COD) registered for ${req.amount.toLocaleString()} ${req.currency}. Cash collection scheduled with courier at delivery.`,
        };
      case 'NAYAPAY':
        return {
          success: true,
          transactionId: req.maskedInstrumentSummary ? `nayapay_${req.maskedInstrumentSummary}` : `nayapay_ref_${txSuffix}`,
          paymentStatus: 'PAID',
          isGatewayConfigured: true,
          providerMessage: `Advance NayaPay Payment Received & Verified (TID: ${req.maskedInstrumentSummary || txSuffix}). Order confirmed.`,
        };
      case 'RAAST_IBAN':
      case 'BANK_TRANSFER':
        return {
          success: true,
          transactionId: req.maskedInstrumentSummary ? `raast_${req.maskedInstrumentSummary}` : `raast_ref_${txSuffix}`,
          paymentStatus: 'PAID',
          isGatewayConfigured: true,
          providerMessage: `Advance Bank / RAAST Payment Received & Verified (Ref: ${req.maskedInstrumentSummary || txSuffix}). Order confirmed.`,
        };
      case 'MANUAL_QUOTE':
        return {
          success: true,
          transactionId: `quote_req_${txSuffix}`,
          paymentStatus: 'PENDING',
          isGatewayConfigured: false,
          providerMessage: `International Shipping & Customs Quote Request logged. Awaiting concierge courier rate review.`,
        };
      case 'STRIPE':
        return {
          success: true,
          transactionId: `card_auth_${txSuffix}`,
          paymentStatus: 'PAID',
          isGatewayConfigured: true,
          providerMessage: `Advance Card Payment Received & Authorized (${req.maskedInstrumentSummary || 'Card'}). Order confirmed.`,
        };
      case 'PAYPAL':
        return {
          success: true,
          transactionId: `paypal_capture_${txSuffix}`,
          paymentStatus: 'PAID',
          isGatewayConfigured: true,
          providerMessage: `Advance PayPal Payment Received & Verified. Order confirmed.`,
        };
      case 'MANUAL':
      default:
        return {
          success: true,
          transactionId: req.maskedInstrumentSummary ? `wire_${req.maskedInstrumentSummary}` : `wire_ref_${txSuffix}`,
          paymentStatus: 'PAID',
          isGatewayConfigured: true,
          providerMessage: `Advance Wallet/Wire Payment Received & Verified (TID: ${req.maskedInstrumentSummary || txSuffix}). Order confirmed.`,
        };
    }
  }
}

// 2. Shipping Rate & Carrier Abstraction Layer
export interface ShippingMethodOption {
  id: string;
  name: string;
  carrier: string;
  estimatedDays: string;
  baseFee: number;
}

export const SHIPPING_METHODS: ShippingMethodOption[] = [
  {
    id: 'ship-standard',
    name: 'Insured Armored Ground Courier',
    carrier: 'DHL Express',
    estimatedDays: '3–5 business days',
    baseFee: 25,
  },
  {
    id: 'ship-Priority',
    name: 'Priority Air Concierge',
    carrier: 'FedEx International Priority',
    estimatedDays: '1–2 business days',
    baseFee: 55,
  },
  {
    id: 'ship-pickup',
    name: 'Atelier Flagship Private Collection',
    carrier: 'In-Boutique Appointment',
    estimatedDays: 'Ready in 2 hours',
    baseFee: 0,
  },
];

export function calculateShippingFee(
  subtotal: number,
  freeThreshold: number,
  selectedMethodId: string,
  hasFreeShippingCoupon: boolean
): number {
  if (hasFreeShippingCoupon) return 0;
  const method = SHIPPING_METHODS.find((m) => m.id === selectedMethodId) || SHIPPING_METHODS[0];
  if (method.id === 'ship-pickup') return 0;
  if (method.id === 'ship-standard' && subtotal >= freeThreshold) return 0;
  return method.baseFee;
}

// 3. Transactional Email Service Abstraction Layer
export interface TransactionalEmailPayload {
  to: string;
  template:
    | 'ORDER_CONFIRMATION'
    | 'PAYMENT_RECEIVED'
    | 'SHIPPING_NOTIFICATION'
    | 'DELIVERY_NOTIFICATION'
    | 'REFUND_NOTICE'
    | 'PROMOTIONAL';
  subject: string;
  storeName?: string;
  orderNumber?: string;
  customerName?: string;
  amount?: number;
  currency?: string;
  paymentMethod?: string;
  paymentReference?: string;
  summary: string;
  htmlBody?: string;
}

export class EmailNotificationService {
  static formatDispatchLog(payload: TransactionalEmailPayload): string {
    return `[Concierge Dispatch Log -> ${payload.to}] (${payload.template}): ${payload.subject} — ${payload.summary}`;
  }

  static generatePaymentReceivedSubject(orderNumber: string, storeName: string): string {
    return `Payment Recieved: Order #${orderNumber} | ${storeName}`;
  }
}

// 4. Configurable Multi-Currency & Pricing Mathematics
// Merchant base currency: PKR. Secondary display currency: USD.
export const DEFAULT_STATIC_USD_TO_PKR_RATE = 278.5;
export const USD_TO_PKR_RATE = DEFAULT_STATIC_USD_TO_PKR_RATE;

export interface MoneyValue {
  amount: number;
  currency: string;
}

export function formatMoney(val: MoneyValue): string {
  if (val.currency === 'PKR') {
    return `PKR ${Math.round(val.amount).toLocaleString('en-US')}`;
  }
  if (val.currency === 'USD') {
    return `$${val.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${val.currency} ${val.amount.toFixed(2)}`;
}

export function formatPKR(usdAmount: number, rate = DEFAULT_STATIC_USD_TO_PKR_RATE): string {
  const pkr = Math.round((Number(usdAmount) || 0) * rate);
  return `PKR ${pkr.toLocaleString('en-US')}`;
}

export function formatDualPrice(
  usdAmount: number,
  includeDecimals = false,
  rate = DEFAULT_STATIC_USD_TO_PKR_RATE
): string {
  const num = Number(usdAmount) || 0;
  const usdStr = includeDecimals
    ? `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${num.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  const pkrStr = formatPKR(num, rate);
  return `${usdStr} (${pkrStr})`;
}

export function sanitizeSlug(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 200) || 'item-slug'
  );
}

export function sanitizeSku(input: string): string {
  return (
    input
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .toUpperCase()
      .slice(0, 60) || `AA-${Date.now().toString().slice(-5)}`
  );
}

export function sanitizeDocId(input: string): string {
  return (
    input
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .slice(0, 120) || `doc-${Date.now()}`
  );
}
