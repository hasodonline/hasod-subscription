"use strict";
/**
 * Transaction Service Layer
 * Handles manual payment transactions
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
exports.processManualPayment = processManualPayment;
exports.getUserTransactions = getUserTransactions;
exports.getAllTransactions = getAllTransactions;
exports.expireOutdatedSubscriptions = expireOutdatedSubscriptions;
const admin = __importStar(require("firebase-admin"));
const FirestoreService = __importStar(require("./firestore.service"));
const GoogleGroupsService = __importStar(require("./google-groups.service"));
const errors_1 = require("../utils/errors");
/**
 * Processes a manual payment and activates service for user
 */
async function processManualPayment(params, googleConfig) {
    const { userEmail, serviceId, amount, durationMonths, paymentMethod, notes = '', receiptNumber, processedByUid, processedByEmail } = params;
    // Validate inputs
    if (!userEmail || !serviceId || !amount || !durationMonths) {
        throw new errors_1.ValidationError('Missing required fields');
    }
    if (amount <= 0) {
        throw new errors_1.ValidationError('Amount must be greater than 0');
    }
    if (durationMonths <= 0 || durationMonths > 120) {
        throw new errors_1.ValidationError('Duration must be between 1 and 120 months');
    }
    // Get or create user by email
    let user = await FirestoreService.getUserByEmail(userEmail);
    if (!user) {
        throw new errors_1.ValidationError(`User with email ${userEmail} not found`);
    }
    const userId = user.id;
    // Get service
    const service = await FirestoreService.getService(serviceId);
    // Calculate dates
    const startDate = admin.firestore.Timestamp.now();
    const endDateMs = startDate.toMillis() + (durationMonths * 30 * 24 * 60 * 60 * 1000);
    const endDate = admin.firestore.Timestamp.fromMillis(endDateMs);
    // Create transaction record
    const transactionData = {
        userId,
        userEmail,
        serviceId,
        serviceName: service.nameHe || service.name,
        amount,
        currency: service.currency,
        durationMonths,
        startDate,
        endDate,
        notes,
        paymentMethod,
        receiptNumber: receiptNumber || '',
        processedBy: processedByUid,
        processedByEmail
    };
    const transactionId = await FirestoreService.createManualTransaction(transactionData);
    // Update user's service status
    await FirestoreService.updateUserService(userId, serviceId, {
        status: 'active',
        paymentMethod: 'manual',
        manualStartDate: startDate,
        manualEndDate: endDate,
        manualTransactionId: transactionId,
        activatedAt: admin.firestore.Timestamp.now(),
        expiresAt: endDate
    });
    // Add to Google Group if applicable
    if (service.googleGroupEmail && user.email) {
        try {
            const result = await GoogleGroupsService.addUserToGroup(user.email, service.googleGroupEmail, googleConfig);
            await FirestoreService.updateUserService(userId, serviceId, {
                inGoogleGroup: result.success
            });
            console.log(`Google Group result:`, result);
        }
        catch (error) {
            console.error('Failed to add user to Google Group:', error);
            // Continue even if group add fails
        }
    }
    console.log(`✅ Manual payment processed: ${transactionId} for user ${userId}, service ${serviceId}`);
    return { transactionId, userId };
}
/**
 * Gets all transactions for a user
 */
async function getUserTransactions(userId) {
    return FirestoreService.getManualTransactionsByUser(userId);
}
/**
 * Gets all transactions with optional filters
 */
async function getAllTransactions(filters) {
    return FirestoreService.getAllManualTransactions(filters);
}
/**
 * Checks and expires manual subscriptions that have passed their end date
 * This should be called by a scheduled Cloud Function
 */
async function expireOutdatedSubscriptions(googleConfig) {
    const users = await FirestoreService.getAllUsers();
    const now = admin.firestore.Timestamp.now();
    let expiredCount = 0;
    for (const user of users) {
        if (!user.services)
            continue;
        for (const [serviceId, subscriptionData] of Object.entries(user.services)) {
            const subscription = subscriptionData;
            // Check manual subscriptions that are active but past end date
            if (subscription.paymentMethod === 'manual' &&
                subscription.status === 'active' &&
                subscription.manualEndDate &&
                subscription.manualEndDate.toMillis() < now.toMillis()) {
                console.log(`Expiring subscription for user ${user.id}, service ${serviceId}`);
                // Update status to expired
                await FirestoreService.updateUserService(user.id, serviceId, {
                    status: 'expired'
                });
                // Remove from Google Group if applicable
                const service = await FirestoreService.getService(serviceId);
                if (service.googleGroupEmail && user.email) {
                    try {
                        await GoogleGroupsService.removeUserFromGroup(user.email, service.googleGroupEmail, googleConfig);
                        await FirestoreService.updateUserService(user.id, serviceId, {
                            inGoogleGroup: false
                        });
                    }
                    catch (error) {
                        console.error('Failed to remove from Google Group:', error);
                    }
                }
                expiredCount++;
            }
        }
    }
    console.log(`✅ Expired ${expiredCount} manual subscriptions`);
    return expiredCount;
}
