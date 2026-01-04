"use strict";
/**
 * PayPal Service Layer
 * Handles all PayPal API interactions
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAccessToken = getAccessToken;
exports.createSubscription = createSubscription;
exports.getSubscription = getSubscription;
exports.cancelSubscription = cancelSubscription;
exports.verifyWebhookSignature = verifyWebhookSignature;
const axios_1 = __importDefault(require("axios"));
const errors_1 = require("../utils/errors");
/**
 * Obtains an OAuth 2.0 access token from PayPal
 */
async function getAccessToken(config) {
    try {
        const tokenUrl = `${config.baseUrl}/v1/oauth2/token`;
        const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
        const response = await axios_1.default.post(tokenUrl, 'grant_type=client_credentials', {
            headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        return response.data.access_token;
    }
    catch (error) {
        throw new errors_1.PayPalError('Failed to get access token', error.response?.data);
    }
}
/**
 * Creates a new PayPal subscription with custom metadata
 */
async function createSubscription(accessToken, config, planId, customId, returnUrl, cancelUrl) {
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
        const response = await axios_1.default.post(url, body, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    }
    catch (error) {
        throw new errors_1.PayPalError('Failed to create subscription', error.response?.data);
    }
}
/**
 * Retrieves subscription details from PayPal
 */
async function getSubscription(accessToken, config, subscriptionId) {
    try {
        const url = `${config.baseUrl}/v1/billing/subscriptions/${subscriptionId}`;
        const response = await axios_1.default.get(url, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        return response.data;
    }
    catch (error) {
        throw new errors_1.PayPalError('Failed to get subscription details', error.response?.data);
    }
}
/**
 * Cancels a PayPal subscription
 */
async function cancelSubscription(accessToken, config, subscriptionId, reason = 'Canceled by user') {
    try {
        const url = `${config.baseUrl}/v1/billing/subscriptions/${subscriptionId}/cancel`;
        await axios_1.default.post(url, { reason }, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
    }
    catch (error) {
        throw new errors_1.PayPalError('Failed to cancel subscription', error.response?.data);
    }
}
/**
 * Verifies PayPal webhook signature (placeholder for future implementation)
 */
async function verifyWebhookSignature(headers, body, config) {
    // TODO: Implement webhook signature verification
    // See: https://developer.paypal.com/docs/api-basics/notifications/webhooks/notification-messages/#verify-webhook-signature
    console.warn('⚠️  Webhook signature verification not implemented');
    return true;
}
