"use strict";
/**
 * Firestore Service Layer
 * Data access layer for Firestore operations
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
exports.getService = getService;
exports.getAllServices = getAllServices;
exports.getActiveServices = getActiveServices;
exports.createService = createService;
exports.updateService = updateService;
exports.deleteService = deleteService;
exports.getUser = getUser;
exports.getUserByEmail = getUserByEmail;
exports.updateUserService = updateUserService;
exports.getAllUsers = getAllUsers;
exports.createSubscriptionMapping = createSubscriptionMapping;
exports.getSubscriptionMapping = getSubscriptionMapping;
exports.createManualTransaction = createManualTransaction;
exports.getManualTransactionsByUser = getManualTransactionsByUser;
exports.getAllManualTransactions = getAllManualTransactions;
exports.createWebhookEvent = createWebhookEvent;
exports.updateWebhookEvent = updateWebhookEvent;
const admin = __importStar(require("firebase-admin"));
const errors_1 = require("../utils/errors");
const db = () => admin.firestore();
// ============================================================================
// Services Collection
// ============================================================================
async function getService(serviceId) {
    const doc = await db().collection('services').doc(serviceId).get();
    if (!doc.exists) {
        throw new errors_1.NotFoundError(`Service '${serviceId}'`);
    }
    return { id: doc.id, ...doc.data() };
}
async function getAllServices() {
    const snapshot = await db().collection('services').orderBy('order').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
async function getActiveServices() {
    const snapshot = await db().collection('services')
        .where('active', '==', true)
        .orderBy('order')
        .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
async function createService(serviceData) {
    const docRef = await db().collection('services').add({
        ...serviceData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return docRef.id;
}
async function updateService(serviceId, updates) {
    await db().collection('services').doc(serviceId).update({
        ...updates,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
}
async function deleteService(serviceId) {
    await db().collection('services').doc(serviceId).delete();
}
// ============================================================================
// Users Collection
// ============================================================================
async function getUser(userId) {
    const doc = await db().collection('users').doc(userId).get();
    if (!doc.exists) {
        throw new errors_1.NotFoundError(`User '${userId}'`);
    }
    return { id: doc.id, ...doc.data() };
}
async function getUserByEmail(email) {
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
async function updateUserService(userId, serviceId, updates) {
    const updateData = {};
    // Filter out undefined values - Firestore doesn't allow them
    for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
            updateData[`services.${serviceId}.${key}`] = value;
        }
    }
    updateData[`services.${serviceId}.updatedAt`] = admin.firestore.FieldValue.serverTimestamp();
    await db().collection('users').doc(userId).update(updateData);
}
async function getAllUsers() {
    const snapshot = await db().collection('users').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
// ============================================================================
// Subscription Mappings Collection
// ============================================================================
async function createSubscriptionMapping(mapping) {
    await db().collection('subscriptionMappings').doc(mapping.subscriptionId).set({
        ...mapping,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
}
async function getSubscriptionMapping(subscriptionId) {
    const doc = await db().collection('subscriptionMappings').doc(subscriptionId).get();
    if (!doc.exists) {
        return null;
    }
    return { id: doc.id, ...doc.data() };
}
// ============================================================================
// Manual Transactions Collection
// ============================================================================
async function createManualTransaction(transaction) {
    const docRef = await db().collection('manualTransactions').add({
        ...transaction,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return docRef.id;
}
async function getManualTransactionsByUser(userId) {
    const snapshot = await db().collection('manualTransactions')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
async function getAllManualTransactions(filters) {
    let query = db().collection('manualTransactions');
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
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}
// ============================================================================
// Webhook Events Collection
// ============================================================================
async function createWebhookEvent(event) {
    await db().collection('webhookEvents').doc(event.eventId).set({
        ...event,
        processedAt: admin.firestore.FieldValue.serverTimestamp()
    });
}
async function updateWebhookEvent(eventId, updates) {
    await db().collection('webhookEvents').doc(eventId).update(updates);
}
