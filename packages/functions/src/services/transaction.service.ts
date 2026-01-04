/**
 * Transaction Service Layer
 * Handles manual payment transactions
 */

import * as admin from 'firebase-admin';
import * as FirestoreService from './firestore.service';
import * as GoogleGroupsService from './google-groups.service';
import { GoogleConfig } from '../utils/config';
import { ValidationError } from '../utils/errors';

export interface CreateManualPaymentParams {
  userEmail: string;
  serviceId: string;
  amount: number;
  durationMonths: number;
  paymentMethod: 'cash' | 'bank-transfer' | 'other';
  notes?: string;
  receiptNumber?: string;
  processedByUid: string;
  processedByEmail: string;
}

/**
 * Processes a manual payment and activates service for user
 */
export async function processManualPayment(
  params: CreateManualPaymentParams,
  googleConfig: GoogleConfig
): Promise<{ transactionId: string; userId: string }> {
  const {
    userEmail,
    serviceId,
    amount,
    durationMonths,
    paymentMethod,
    notes = '',
    receiptNumber,
    processedByUid,
    processedByEmail
  } = params;

  // Validate inputs
  if (!userEmail || !serviceId || !amount || !durationMonths) {
    throw new ValidationError('Missing required fields');
  }

  if (amount <= 0) {
    throw new ValidationError('Amount must be greater than 0');
  }

  if (durationMonths <= 0 || durationMonths > 120) {
    throw new ValidationError('Duration must be between 1 and 120 months');
  }

  // Get or create user by email
  let user = await FirestoreService.getUserByEmail(userEmail);

  if (!user) {
    throw new ValidationError(`User with email ${userEmail} not found`);
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
      const result = await GoogleGroupsService.addUserToGroup(
        user.email,
        service.googleGroupEmail,
        googleConfig
      );

      await FirestoreService.updateUserService(userId, serviceId, {
        inGoogleGroup: result.success
      });

      console.log(`Google Group result:`, result);
    } catch (error) {
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
export async function getUserTransactions(userId: string): Promise<any[]> {
  return FirestoreService.getManualTransactionsByUser(userId);
}

/**
 * Gets all transactions with optional filters
 */
export async function getAllTransactions(filters?: {
  serviceId?: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<any[]> {
  return FirestoreService.getAllManualTransactions(filters);
}

/**
 * Checks and expires manual subscriptions that have passed their end date
 * This should be called by a scheduled Cloud Function
 */
export async function expireOutdatedSubscriptions(googleConfig: GoogleConfig): Promise<number> {
  const users = await FirestoreService.getAllUsers();
  const now = admin.firestore.Timestamp.now();
  let expiredCount = 0;

  for (const user of users) {
    if (!user.services) continue;

    for (const [serviceId, subscriptionData] of Object.entries(user.services as any)) {
      const subscription = subscriptionData as any;
      // Check manual subscriptions that are active but past end date
      if (
        subscription.paymentMethod === 'manual' &&
        subscription.status === 'active' &&
        subscription.manualEndDate &&
        subscription.manualEndDate.toMillis() < now.toMillis()
      ) {
        console.log(`Expiring subscription for user ${user.id}, service ${serviceId}`);

        // Update status to expired
        await FirestoreService.updateUserService(user.id, serviceId, {
          status: 'expired'
        });

        // Remove from Google Group if applicable
        const service = await FirestoreService.getService(serviceId);
        if (service.googleGroupEmail && user.email) {
          try {
            await GoogleGroupsService.removeUserFromGroup(
              user.email,
              service.googleGroupEmail,
              googleConfig
            );

            await FirestoreService.updateUserService(user.id, serviceId, {
              inGoogleGroup: false
            });
          } catch (error) {
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
