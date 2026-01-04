/**
 * PayPal Service Layer
 * Handles all PayPal API interactions
 */

import axios from 'axios';
import { PayPalConfig } from '../utils/config';
import { PayPalError } from '../utils/errors';

/**
 * Obtains an OAuth 2.0 access token from PayPal
 */
export async function getAccessToken(config: PayPalConfig): Promise<string> {
  try {
    const tokenUrl = `${config.baseUrl}/v1/oauth2/token`;
    const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

    const response = await axios.post(
      tokenUrl,
      'grant_type=client_credentials',
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    return response.data.access_token as string;
  } catch (error: any) {
    throw new PayPalError('Failed to get access token', error.response?.data);
  }
}

/**
 * Creates a new PayPal subscription with custom metadata
 */
export async function createSubscription(
  accessToken: string,
  config: PayPalConfig,
  planId: string,
  customId: string,
  returnUrl: string,
  cancelUrl: string
): Promise<any> {
  try {
    const url = `${config.baseUrl}/v1/billing/subscriptions`;
    const body = {
      plan_id: planId,
      custom_id: customId, // Format: "userId:serviceId"
      application_context: {
        return_url: returnUrl,
        cancel_url: cancelUrl,
        brand_name: 'Hasod Online Services',
        user_action: 'SUBSCRIBE_NOW'
      }
    };

    const response = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  } catch (error: any) {
    throw new PayPalError('Failed to create subscription', error.response?.data);
  }
}

/**
 * Retrieves subscription details from PayPal
 */
export async function getSubscription(
  accessToken: string,
  config: PayPalConfig,
  subscriptionId: string
): Promise<any> {
  try {
    const url = `${config.baseUrl}/v1/billing/subscriptions/${subscriptionId}`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    return response.data;
  } catch (error: any) {
    throw new PayPalError('Failed to get subscription details', error.response?.data);
  }
}

/**
 * Cancels a PayPal subscription
 */
export async function cancelSubscription(
  accessToken: string,
  config: PayPalConfig,
  subscriptionId: string,
  reason: string = 'Canceled by user'
): Promise<void> {
  try {
    const url = `${config.baseUrl}/v1/billing/subscriptions/${subscriptionId}/cancel`;
    await axios.post(
      url,
      { reason },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (error: any) {
    throw new PayPalError('Failed to cancel subscription', error.response?.data);
  }
}

/**
 * Verifies PayPal webhook signature (placeholder for future implementation)
 */
export async function verifyWebhookSignature(
  headers: any,
  body: any,
  config: PayPalConfig
): Promise<boolean> {
  // TODO: Implement webhook signature verification
  // See: https://developer.paypal.com/docs/api-basics/notifications/webhooks/notification-messages/#verify-webhook-signature
  console.warn('⚠️  Webhook signature verification not implemented');
  return true;
}
