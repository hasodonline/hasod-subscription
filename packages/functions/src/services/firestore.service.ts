/**
 * Firestore Service Layer
 * Data access layer for Firestore operations
 */

import * as admin from 'firebase-admin';
import { NotFoundError } from '../utils/errors';

const db = () => admin.firestore();

// ============================================================================
// Services Collection
// ============================================================================

export async function getService(serviceId: string): Promise<any> {
  const doc = await db().collection('services').doc(serviceId).get();
  if (!doc.exists) {
    throw new NotFoundError(`Service '${serviceId}'`);
  }
  return { id: doc.id, ...doc.data() };
}

export async function getAllServices(): Promise<any[]> {
  const snapshot = await db().collection('services').orderBy('order').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function getActiveServices(): Promise<any[]> {
  const snapshot = await db().collection('services')
    .where('active', '==', true)
    .orderBy('order')
    .get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function createService(serviceData: any): Promise<string> {
  const docRef = await db().collection('services').add({
    ...serviceData,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return docRef.id;
}

export async function updateService(serviceId: string, updates: any): Promise<void> {
  await db().collection('services').doc(serviceId).update({
    ...updates,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

export async function deleteService(serviceId: string): Promise<void> {
  await db().collection('services').doc(serviceId).delete();
}

// ============================================================================
// Users Collection
// ============================================================================

export async function getUser(userId: string): Promise<any> {
  const doc = await db().collection('users').doc(userId).get();
  if (!doc.exists) {
    throw new NotFoundError(`User '${userId}'`);
  }
  return { id: doc.id, ...doc.data() };
}

export async function getUserByEmail(email: string): Promise<any | null> {
  const snapshot = await db().collection('users')
    .where('email', '==', email)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

export async function updateUserService(
  userId: string,
  serviceId: string,
  updates: any
): Promise<void> {
  const updateData: any = {};

  // Filter out undefined values - Firestore doesn't allow them
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      updateData[`services.${serviceId}.${key}`] = value;
    }
  }

  updateData[`services.${serviceId}.updatedAt`] = admin.firestore.FieldValue.serverTimestamp();

  await db().collection('users').doc(userId).update(updateData);
}

export async function getAllUsers(): Promise<any[]> {
  const snapshot = await db().collection('users').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// ============================================================================
// Subscription Mappings Collection
// ============================================================================

export async function createSubscriptionMapping(mapping: {
  subscriptionId: string;
  userId: string;
  serviceId: string;
  planId: string;
  customId: string;
}): Promise<void> {
  await db().collection('subscriptionMappings').doc(mapping.subscriptionId).set({
    ...mapping,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

export async function getSubscriptionMapping(subscriptionId: string): Promise<any | null> {
  const doc = await db().collection('subscriptionMappings').doc(subscriptionId).get();
  if (!doc.exists) {
    return null;
  }
  return { id: doc.id, ...doc.data() };
}

// ============================================================================
// Manual Transactions Collection
// ============================================================================

export async function createManualTransaction(transaction: any): Promise<string> {
  const docRef = await db().collection('manualTransactions').add({
    ...transaction,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return docRef.id;
}

export async function getManualTransactionsByUser(userId: string): Promise<any[]> {
  const snapshot = await db().collection('manualTransactions')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function getAllManualTransactions(filters?: {
  serviceId?: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<any[]> {
  let query: any = db().collection('manualTransactions');

  if (filters?.serviceId) {
    query = query.where('serviceId', '==', filters.serviceId);
  }

  if (filters?.startDate) {
    query = query.where('createdAt', '>=', filters.startDate);
  }

  if (filters?.endDate) {
    query = query.where('createdAt', '<=', filters.endDate);
  }

  const snapshot = await query.orderBy('createdAt', 'desc').get();
  return snapshot.docs.map((doc: admin.firestore.QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data() }));
}

// ============================================================================
// Webhook Events Collection
// ============================================================================

export async function createWebhookEvent(event: any): Promise<void> {
  await db().collection('webhookEvents').doc(event.eventId).set({
    ...event,
    processedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

export async function updateWebhookEvent(eventId: string, updates: any): Promise<void> {
  await db().collection('webhookEvents').doc(eventId).update(updates);
}
