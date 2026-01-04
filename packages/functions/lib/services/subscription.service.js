"use strict";
/**
 * Subscription Service Layer
 * Business logic for managing subscriptions
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUserSubscription = createUserSubscription;
exports.activateUserSubscription = activateUserSubscription;
exports.cancelUserSubscription = cancelUserSubscription;
exports.processWebhookEvent = processWebhookEvent;
const admin = __importStar(require("firebase-admin"));
const PayPalService = __importStar(require("./paypal.service"));
const GoogleGroupsService = __importStar(require("./google-groups.service"));
const FirestoreService = __importStar(require("./firestore.service"));
const errors_1 = require("../utils/errors");
/**
 * Creates a new subscription for a user and service
 */
async function createUserSubscription(userId, serviceId, paypalConfig, appConfig) {
    // Validate inputs
    if (!userId || !serviceId) {
        throw new errors_1.ValidationError('userId and serviceId are required');
    }
    // Get service details
    const service = await FirestoreService.getService(serviceId);
    if (!service.active) {
        throw new errors_1.ValidationError(`Service '${serviceId}' is not available`);
    }
    if (!service.paypalPlanId) {
        throw new errors_1.ValidationError(`Service '${serviceId}' does not have a PayPal plan configured`);
    }
    // Get user to verify they exist
    const user = await FirestoreService.getUser(userId);
    // Create custom ID for PayPal
    const customId = `${userId}:${serviceId}`;
    // Construct return URLs
    const returnUrl = `${appConfig.url}/paypal-return?serviceId=${serviceId}`;
    const cancelUrl = `${appConfig.url}/subscriptions`;
    // Get PayPal access token
    const accessToken = await PayPalService.getAccessToken(paypalConfig);
    // Create PayPal subscription
    const subscription = await PayPalService.createSubscription(accessToken, paypalConfig, service.paypalPlanId, customId, returnUrl, cancelUrl);
    // Extract approval URL
    const links = subscription.links || [];
    const approvalUrl = links.find((l) => l.rel === 'approve')?.href || '';
    if (!approvalUrl) {
        throw new Error('No approval URL returned from PayPal');
    }
    // Save subscription to user document
    await FirestoreService.updateUserService(userId, serviceId, {
        paypalSubscriptionId: subscription.id,
        status: 'pending',
        paymentMethod: 'paypal',
        paypalSubscriptionStatus: 'pending'
    });
    // Create subscription mapping for webhook processing
    await FirestoreService.createSubscriptionMapping({
        subscriptionId: subscription.id,
        userId,
        serviceId,
        planId: service.paypalPlanId,
        customId
    });
    console.log(`✅ Created subscription ${subscription.id} for user ${userId}, service ${serviceId}`);
    return {
        approvalUrl,
        subscription,
        subscriptionId: subscription.id
    };
}
/**
 * Activates a subscription after PayPal approval
 */
async function activateUserSubscription(userId, subscriptionId, paypalConfig, googleConfig) {
    // Get subscription details from PayPal
    const accessToken = await PayPalService.getAccessToken(paypalConfig);
    const subscription = await PayPalService.getSubscription(accessToken, paypalConfig, subscriptionId);
    // Get mapping to determine which service
    const mapping = await FirestoreService.getSubscriptionMapping(subscriptionId);
    if (!mapping) {
        // Fallback: try to parse from custom_id in subscription
        const customId = subscription.custom_id;
        if (!customId || !customId.includes(':')) {
            throw new Error('Cannot determine service for subscription');
        }
        const [mappedUserId, serviceId] = customId.split(':');
        if (mappedUserId !== userId) {
            throw new Error('Subscription does not belong to this user');
        }
        // Create mapping for future
        await FirestoreService.createSubscriptionMapping({
            subscriptionId,
            userId,
            serviceId,
            planId: subscription.plan_id,
            customId
        });
        return activateSubscriptionForService(userId, serviceId, subscription, googleConfig);
    }
    const { serviceId } = mapping;
    // Verify user matches
    if (mapping.userId !== userId) {
        throw new errors_1.ValidationError('Subscription does not belong to this user');
    }
    return activateSubscriptionForService(userId, serviceId, subscription, googleConfig);
}
/**
 * Activates subscription for a specific service
 */
async function activateSubscriptionForService(userId, serviceId, subscription, googleConfig) {
    const status = subscription.status?.toLowerCase() || 'pending';
    // Get user and service data
    const user = await FirestoreService.getUser(userId);
    const service = await FirestoreService.getService(serviceId);
    // Update user service status
    const updates = {
        status,
        paypalSubscriptionStatus: status,
        paymentMethod: 'paypal'
    };
    if (status === 'active') {
        updates.activatedAt = admin.firestore.FieldValue.serverTimestamp();
    }
    await FirestoreService.updateUserService(userId, serviceId, updates);
    // Handle Google Group membership if service has a group
    if (status === 'active' && service.googleGroupEmail && user.email) {
        try {
            const result = await GoogleGroupsService.addUserToGroup(user.email, service.googleGroupEmail, googleConfig);
            await FirestoreService.updateUserService(userId, serviceId, {
                inGoogleGroup: result.success
            });
            console.log(`Google Group result:`, result);
        }
        catch (error) {
            console.error('Failed to add user to Google Group:', error);
            // Don't fail the subscription activation if group add fails
        }
    }
    console.log(`✅ Activated subscription for user ${userId}, service ${serviceId}, status ${status}`);
    return {
        success: true,
        status,
        serviceId,
        subscription
    };
}
/**
 * Cancels a user's subscription for a service
 */
async function cancelUserSubscription(userId, serviceId, paypalConfig, googleConfig, reason = 'Canceled by administrator') {
    const user = await FirestoreService.getUser(userId);
    const service = await FirestoreService.getService(serviceId);
    const userService = user.services?.[serviceId];
    if (!userService) {
        throw new errors_1.NotFoundError(`Subscription for service '${serviceId}'`);
    }
    // Cancel with PayPal if it's a PayPal subscription
    if (userService.paymentMethod === 'paypal' && userService.paypalSubscriptionId) {
        const accessToken = await PayPalService.getAccessToken(paypalConfig);
        await PayPalService.cancelSubscription(accessToken, paypalConfig, userService.paypalSubscriptionId, reason);
    }
    // Update user service status
    await FirestoreService.updateUserService(userId, serviceId, {
        status: 'canceled',
        paypalSubscriptionStatus: userService.paymentMethod === 'paypal' ? 'canceled' : undefined
    });
    // Remove from Google Group if applicable
    if (service.googleGroupEmail && user.email) {
        try {
            await GoogleGroupsService.removeUserFromGroup(user.email, service.googleGroupEmail, googleConfig);
            await FirestoreService.updateUserService(userId, serviceId, {
                inGoogleGroup: false
            });
        }
        catch (error) {
            console.error('Failed to remove user from Google Group:', error);
        }
    }
    console.log(`✅ Canceled subscription for user ${userId}, service ${serviceId}`);
}
/**
 * Finds user with legacy subscription structure (backward compatibility)
 * For subscriptions created before multi-service implementation
 */
async function findUserByLegacySubscription(subscriptionId) {
    const usersSnapshot = await admin.firestore()
        .collection('users')
        .where('paypalSubscriptionId', '==', subscriptionId)
        .limit(1)
        .get();
    if (usersSnapshot.empty) {
        return null;
    }
    const doc = usersSnapshot.docs[0];
    return { id: doc.id, ...doc.data() };
}
/**
 * Processes webhook event from PayPal
 */
async function processWebhookEvent(event, googleConfig) {
    const subscriptionId = event.resource?.id;
    const customId = event.resource?.custom_id;
    const status = event.resource?.status?.toLowerCase() || '';
    if (!subscriptionId) {
        throw new Error('Missing subscription ID in webhook event');
    }
    let userId;
    let serviceId;
    // Strategy 1: Try custom_id first (new subscriptions)
    if (customId && customId.includes(':')) {
        [userId, serviceId] = customId.split(':');
        console.log(`✅ Identified via custom_id: user=${userId}, service=${serviceId}`);
    }
    // Strategy 2: Fallback to mapping collection
    else {
        const mapping = await FirestoreService.getSubscriptionMapping(subscriptionId);
        if (mapping) {
            userId = mapping.userId;
            serviceId = mapping.serviceId;
            console.log(`✅ Identified via mapping: user=${userId}, service=${serviceId}`);
        }
        // Strategy 3: Legacy fallback - query old schema (for existing subscriptions)
        else {
            console.log(`⚠️  No custom_id or mapping found. Trying legacy lookup...`);
            const legacyUser = await findUserByLegacySubscription(subscriptionId);
            if (legacyUser) {
                userId = legacyUser.id;
                serviceId = 'music-library'; // Legacy subscriptions are always music-library
                console.log(`✅ Identified via legacy lookup: user=${userId}, service=${serviceId}`);
                // Create mapping for future webhooks
                await FirestoreService.createSubscriptionMapping({
                    subscriptionId,
                    userId,
                    serviceId,
                    planId: 'P-4TS05390XU019010LNAY3XOI', // Legacy plan ID
                    customId: `${userId}:${serviceId}`
                });
                console.log(`✅ Created mapping for legacy subscription ${subscriptionId}`);
            }
            else {
                console.error(`❌ Could not identify subscription ${subscriptionId} - not found in any method`);
                return null;
            }
        }
    }
    // Get user and service
    const user = await FirestoreService.getUser(userId);
    const service = await FirestoreService.getService(serviceId);
    // Update subscription status
    await FirestoreService.updateUserService(userId, serviceId, {
        status,
        paypalSubscriptionStatus: status
    });
    // Handle Google Group membership
    if (service.googleGroupEmail && user.email) {
        try {
            if (status === 'active') {
                await GoogleGroupsService.addUserToGroup(user.email, service.googleGroupEmail, googleConfig);
                await FirestoreService.updateUserService(userId, serviceId, { inGoogleGroup: true });
            }
            else if (['canceled', 'expired', 'suspended'].includes(status)) {
                await GoogleGroupsService.removeUserFromGroup(user.email, service.googleGroupEmail, googleConfig);
                await FirestoreService.updateUserService(userId, serviceId, { inGoogleGroup: false });
            }
        }
        catch (error) {
            console.error('Failed to manage Google Group membership:', error);
        }
    }
    console.log(`✅ Processed webhook for user ${userId}, service ${serviceId}, status ${status}`);
    return { userId, serviceId };
}
