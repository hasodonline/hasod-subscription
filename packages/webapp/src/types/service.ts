/**
 * Service Type Definitions (Frontend)
 */

export interface Service {
  id: string;
  name: string;
  nameHe: string;
  description: string;
  descriptionHe: string;
  paypalPlanId: string;
  pricePerMonth: number;
  currency: 'USD' | 'ILS';
  googleGroupEmail?: string;
  active: boolean;
  order: number;
  features: string[];
  featuresHe: string[];
  createdAt: any;
  updatedAt: any;
  createdBy: string;
}

export type ServiceId = 'music-library' | 'hasod-downloader' | string;

export type SubscriptionStatus = 'active' | 'pending' | 'canceled' | 'expired' | 'suspended' | 'none';
export type PaymentMethod = 'paypal' | 'manual';

export interface UserServiceSubscription {
  status: SubscriptionStatus;
  paymentMethod: PaymentMethod;

  // PayPal specific
  paypalSubscriptionId?: string;
  paypalSubscriptionStatus?: string;

  // Manual payment specific
  manualStartDate?: any;
  manualEndDate?: any;
  manualTransactionId?: string;

  // Google Group
  inGoogleGroup?: boolean;

  // Timestamps
  activatedAt?: any;
  expiresAt?: any;
  updatedAt: any;
}

export function hasActiveSubscription(service?: UserServiceSubscription): boolean {
  return service?.status === 'active';
}

export function getServiceStatus(service?: UserServiceSubscription): SubscriptionStatus {
  return service?.status || 'none';
}

export function isManualPayment(service?: UserServiceSubscription): boolean {
  return service?.paymentMethod === 'manual';
}

export function isPayPalPayment(service?: UserServiceSubscription): boolean {
  return service?.paymentMethod === 'paypal';
}
