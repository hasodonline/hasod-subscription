/**
 * Shared constants
 *
 * Constants used across all applications
 */

export const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://us-central1-hasod-41a23.cloudfunctions.net/api'
  : 'http://localhost:5001/hasod-41a23/us-central1/api';

export const ADMIN_EMAILS = [
  'hasod@hasodonline.com',
  'yubarkan@gmail.com'
];

export const SUBSCRIPTION_DURATIONS = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12
} as const;

export const PAYMENT_METHODS = {
  PAYPAL: 'paypal',
  MANUAL: 'manual'
} as const;
