/**
 * Shared Type Definitions
 * Used by both frontend and backend for type safety
 *
 * NOTE: API types are now defined in packages/api-spec/openapi.yaml
 * The webapp uses generated types from packages/webapp/src/api/schema.d.ts
 *
 * This file is kept for backward compatibility with the functions package.
 * New API types should be added to the OpenAPI spec first.
 */

import { Timestamp } from 'firebase/firestore';

// ============================================================================
// Service Types
// ============================================================================

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
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

export type ServiceId = 'music-library' | 'hasod-downloader' | string;

// ============================================================================
// User Subscription Types
// ============================================================================

export type SubscriptionStatus = 'active' | 'pending' | 'canceled' | 'expired' | 'suspended' | 'none';
export type PaymentMethod = 'paypal' | 'manual';
export type ManualPaymentMethod = 'cash' | 'bank-transfer' | 'other';

export interface UserServiceSubscription {
  status: SubscriptionStatus;
  paymentMethod: PaymentMethod;

  // PayPal specific fields
  paypalSubscriptionId?: string;
  paypalSubscriptionStatus?: string;

  // Manual payment fields
  manualStartDate?: Timestamp;
  manualEndDate?: Timestamp;
  manualTransactionId?: string;

  // Google Group membership
  inGoogleGroup?: boolean;

  // Timestamps
  activatedAt?: Timestamp;
  expiresAt?: Timestamp;
  updatedAt: Timestamp;
}

export interface UserProfile {
  uid: string;
  email: string;
  name?: string;
  phone?: string;
  services?: {
    [serviceId: string]: UserServiceSubscription;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;

  // Legacy fields (backward compatibility - will be removed after migration)
  paypalSubscriptionId?: string;
  paypalSubscriptionStatus?: string;
  inGoogleGroup?: boolean;
}

// ============================================================================
// Transaction Types
// ============================================================================

export interface ManualTransaction {
  id: string;
  userId: string;
  userEmail: string;
  serviceId: string;
  serviceName: string;
  amount: number;
  currency: string;
  durationMonths: number;
  startDate: Timestamp;
  endDate: Timestamp;
  notes: string;
  processedBy: string;
  processedByEmail: string;
  createdAt: Timestamp;
  paymentMethod: ManualPaymentMethod;
  receiptNumber?: string;
}

export interface CreateManualTransactionRequest {
  userEmail: string;
  serviceId: string;
  amount: number;
  durationMonths: number;
  paymentMethod: ManualPaymentMethod;
  notes?: string;
  receiptNumber?: string;
}

// ============================================================================
// Subscription Mapping Types
// ============================================================================

export interface SubscriptionMapping {
  subscriptionId: string;
  userId: string;
  serviceId: string;
  planId: string;
  customId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// Webhook Event Types
// ============================================================================

export interface WebhookEvent {
  eventId: string;
  eventType: string;
  subscriptionId: string | null;
  status: string | null;
  payload: any;
  processedAt: Timestamp;
  processed: boolean;
  error: string | null;
  userId?: string;
  userEmail?: string;
  serviceId?: string;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface CreateSubscriptionRequest {
  uid: string;
  serviceId: string;
}

export interface CreateSubscriptionResponse {
  approvalUrl: string;
  subscription: any;
  subscriptionId: string;
  serviceId: string;
}

export interface ActivateSubscriptionRequest {
  uid: string;
  subscriptionId: string;
}

export interface ActivateSubscriptionResponse {
  success: boolean;
  status: string;
  serviceId: string;
  subscription: any;
}

// ============================================================================
// Helper Types
// ============================================================================

export interface ServiceStats {
  total: number;
  active: number;
  pending: number;
  canceled: number;
  expired: number;
  none: number;
}

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  sandbox: boolean;
  baseUrl: string;
}

export interface AppConfig {
  url: string;
}
