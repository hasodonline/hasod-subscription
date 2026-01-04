/**
 * Hasod Subscription Management Cloud Functions
 * Clean Architecture with Service Layer Pattern
 * Updated: 2026-01-04 - Migrated to .env, upgraded to 2nd Gen functions
 *
 * @module functions/index
 */

import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import express, { Request, Response, NextFunction } from 'express';

// Service layers
import * as SubscriptionService from './services/subscription.service';
import * as TransactionService from './services/transaction.service';
import * as FirestoreService from './services/firestore.service';

// Utilities
import { getPayPalConfig, getAppConfig, getGoogleConfig, validatePayPalConfig } from './utils/config';
import { AppError } from './utils/errors';

// Initialize Firebase Admin SDK
// In 2nd Gen functions, this uses Application Default Credentials
admin.initializeApp();
const app = express();

// ============================================================================
// Middleware
// ============================================================================

// CORS middleware
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  next();
});

app.use(express.json());

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('❌ Error:', err);

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code
    });
  }

  return res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ============================================================================
// Service Endpoints
// ============================================================================

/**
 * GET /services
 * Returns all active services
 */
app.get('/services', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const services = await FirestoreService.getActiveServices();
    res.json({ services });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /services/:serviceId
 * Returns a specific service
 */
app.get('/services/:serviceId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serviceId } = req.params;
    const service = await FirestoreService.getService(serviceId);
    res.json({ service });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Subscription Endpoints
// ============================================================================

/**
 * POST /create-subscription
 * Creates a new PayPal subscription for a user and service
 */
app.post('/create-subscription', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { uid, serviceId } = req.body;

    const paypalConfig = getPayPalConfig();
    const appConfig = getAppConfig();

    validatePayPalConfig(paypalConfig);

    const result = await SubscriptionService.createUserSubscription(
      uid,
      serviceId,
      paypalConfig,
      appConfig
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /activate-subscription
 * Activates a subscription after PayPal approval
 */
app.post('/activate-subscription', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { uid, subscriptionId } = req.body;

    const paypalConfig = getPayPalConfig();
    const googleConfig = getGoogleConfig();

    validatePayPalConfig(paypalConfig);

    const result = await SubscriptionService.activateUserSubscription(
      uid,
      subscriptionId,
      paypalConfig,
      googleConfig
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /paypal-webhook
 * Handles PayPal webhook events
 */
app.post('/paypal-webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const event = req.body;
    const eventId = event.id || `webhook_${Date.now()}`;

    console.log(`📥 Webhook received: ${event.event_type}`);

    // Log webhook event to Firestore
    await FirestoreService.createWebhookEvent({
      eventId,
      eventType: event.event_type || 'unknown',
      subscriptionId: event.resource?.id || null,
      status: event.resource?.status || null,
      payload: event,
      processed: false,
      error: null
    });

    // Process the webhook
    const googleConfig = getGoogleConfig();
    const result = await SubscriptionService.processWebhookEvent(event, googleConfig);

    // Update webhook log with result
    if (result) {
      await FirestoreService.updateWebhookEvent(eventId, {
        processed: true,
        userId: result.userId,
        serviceId: result.serviceId
      });
    } else {
      await FirestoreService.updateWebhookEvent(eventId, {
        processed: true,
        error: 'Could not identify user/service for subscription'
      });
    }

    res.sendStatus(200);
  } catch (error: any) {
    console.error('❌ Webhook error:', error);

    // Try to log error
    try {
      const errorEventId = req.body?.id || `webhook_error_${Date.now()}`;
      await FirestoreService.createWebhookEvent({
        eventId: errorEventId,
        eventType: req.body?.event_type || 'unknown',
        subscriptionId: req.body?.resource?.id || null,
        status: null,
        payload: req.body,
        processed: false,
        error: error instanceof Error ? error.message : String(error)
      });
    } catch (logError) {
      console.error('Failed to log webhook error:', logError);
    }

    res.sendStatus(500);
  }
});

// ============================================================================
// User Endpoints
// ============================================================================

/**
 * GET /user/subscription-status
 * Gets user's subscription status (for desktop app license validation)
 * Supports both email param (for initial check) and Bearer token auth
 */
app.get('/user/subscription-status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let userEmail: string | null = null;

    // Try to get email from query param (desktop app initial check)
    if (req.query.email) {
      userEmail = req.query.email as string;
    }

    // Try to get from Authorization header (if provided)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decodedToken = await admin.auth().verifyIdToken(token);
        userEmail = decodedToken.email || null;
      } catch (authError) {
        console.error('Token verification failed:', authError);
        // Continue with email param if token verification fails
      }
    }

    if (!userEmail) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please provide email parameter or Bearer token'
      });
    }

    // Get user document from Firestore
    const userDoc = await admin.firestore().collection('users').doc(userEmail).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        error: 'User not found',
        email: userEmail
      });
    }

    const userData = userDoc.data();

    // Return user email and services
    res.json({
      email: userEmail,
      services: userData?.services || {}
    });
  } catch (error) {
    console.error('Error getting subscription status:', error);
    next(error);
  }
});

// ============================================================================
// Admin Endpoints
// ============================================================================

/**
 * POST /admin/services
 * Creates or updates a service (admin only)
 */
app.post('/admin/services', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { service } = req.body;

    if (service.id) {
      // Update existing
      await FirestoreService.updateService(service.id, service);
      res.json({ success: true, message: 'Service updated', serviceId: service.id });
    } else {
      // Create new
      const serviceId = await FirestoreService.createService(service);
      res.json({ success: true, message: 'Service created', serviceId });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /admin/services/:serviceId
 * Deletes a service (admin only)
 */
app.delete('/admin/services/:serviceId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serviceId } = req.params;
    await FirestoreService.deleteService(serviceId);
    res.json({ success: true, message: 'Service deleted' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/manual-payment
 * Processes a manual payment (admin only)
 */
app.post('/admin/manual-payment', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      userEmail,
      serviceId,
      amount,
      durationMonths,
      paymentMethod,
      notes,
      receiptNumber,
      processedByUid,
      processedByEmail
    } = req.body;

    const googleConfig = getGoogleConfig();

    const result = await TransactionService.processManualPayment(
      {
        userEmail,
        serviceId,
        amount,
        durationMonths,
        paymentMethod,
        notes,
        receiptNumber,
        processedByUid,
        processedByEmail
      },
      googleConfig
    );

    res.json({
      success: true,
      message: 'Manual payment processed',
      ...result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /admin/manual-transactions
 * Gets all manual transactions (admin only)
 */
app.get('/admin/manual-transactions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serviceId, startDate, endDate } = req.query;

    const filters: any = {};
    if (serviceId) filters.serviceId = serviceId as string;
    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);

    const transactions = await TransactionService.getAllTransactions(filters);
    res.json({ transactions });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /admin/manual-transactions/:userId
 * Gets manual transactions for a specific user (admin only)
 */
app.get('/admin/manual-transactions/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    const transactions = await TransactionService.getUserTransactions(userId);
    res.json({ transactions });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/cancel-subscription
 * Cancels a user's subscription for a service (admin only)
 */
app.post('/admin/cancel-subscription', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { uid, serviceId, reason } = req.body;

    const paypalConfig = getPayPalConfig();
    const googleConfig = getGoogleConfig();

    await SubscriptionService.cancelUserSubscription(
      uid,
      serviceId,
      paypalConfig,
      googleConfig,
      reason
    );

    res.json({ success: true, message: 'Subscription canceled' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/manage-group
 * Manually manages Google Group membership (admin only)
 */
app.post('/admin/manage-group', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { uid, serviceId, action } = req.body;

    const user = await FirestoreService.getUser(uid);
    const service = await FirestoreService.getService(serviceId);
    const googleConfig = getGoogleConfig();

    if (!service.googleGroupEmail) {
      return res.status(400).json({ error: 'Service does not have a Google Group' });
    }

    if (!user.email) {
      return res.status(400).json({ error: 'User email not found' });
    }

    const GoogleGroupsService = await import('./services/google-groups.service');

    let result;
    if (action === 'add') {
      result = await GoogleGroupsService.addUserToGroup(user.email, service.googleGroupEmail, googleConfig);
      await FirestoreService.updateUserService(uid, serviceId, { inGoogleGroup: result.success });
    } else if (action === 'remove') {
      result = await GoogleGroupsService.removeUserFromGroup(user.email, service.googleGroupEmail, googleConfig);
      await FirestoreService.updateUserService(uid, serviceId, { inGoogleGroup: false });
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

    res.json({ success: result.success, message: result.message });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/migrate-users
 * One-time endpoint to migrate users to multi-service schema (admin only)
 */
app.post('/admin/migrate-users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const usersSnapshot = await admin.firestore().collection('users').get();
    let migratedCount = 0;
    let skippedCount = 0;

    for (const userDoc of usersSnapshot.docs) {
      const data = userDoc.data();

      // Skip if already migrated
      if (data.services) {
        skippedCount++;
        continue;
      }

      // Skip if no old subscription data
      if (!data.paypalSubscriptionId && !data.paypalSubscriptionStatus) {
        skippedCount++;
        continue;
      }

      // Create new services structure
      const services: any = {
        'music-library': {
          status: data.paypalSubscriptionStatus || 'none',
          paymentMethod: 'paypal',
          paypalSubscriptionId: data.paypalSubscriptionId || null,
          paypalSubscriptionStatus: data.paypalSubscriptionStatus || null,
          inGoogleGroup: data.inGoogleGroup || false,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }
      };

      if (data.paypalSubscriptionStatus === 'active') {
        services['music-library'].activatedAt = admin.firestore.FieldValue.serverTimestamp();
      }

      // Update user
      await userDoc.ref.update({
        services,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Create mapping for legacy subscription
      if (data.paypalSubscriptionId) {
        await FirestoreService.createSubscriptionMapping({
          subscriptionId: data.paypalSubscriptionId,
          userId: userDoc.id,
          serviceId: 'music-library',
          planId: 'P-4TS05390XU019010LNAY3XOI',
          customId: `${userDoc.id}:music-library`
        });
      }

      migratedCount++;
    }

    res.json({
      success: true,
      message: 'User migration complete',
      migrated: migratedCount,
      skipped: skippedCount,
      total: usersSnapshot.docs.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/seed-services
 * One-time endpoint to seed the services collection (admin only)
 */
app.post('/admin/seed-services', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const SERVICES = [
      {
        id: 'music-library',
        name: 'Music Library Access',
        nameHe: 'גישה לספריית המוזיקה',
        description: 'Access to Hasod Online\'s exclusive music collection with unlimited streaming and downloads',
        descriptionHe: 'גישה לאוסף המוזיקה הבלעדי של הסוד אונליין עם הזרמה והורדות ללא הגבלה',
        paypalPlanId: 'P-4TS05390XU019010LNAY3XOI',
        pricePerMonth: 10,
        currency: 'USD',
        googleGroupEmail: 'hasod-online-member-v1@hasodonline.com',
        active: true,
        order: 1,
        features: ['Unlimited music streaming', 'Download access', 'Google Drive integration', 'High-quality audio', 'New releases every week'],
        featuresHe: ['הזרמת מוזיקה ללא הגבלה', 'אפשרות הורדה', 'אינטגרציה עם Google Drive', 'איכות אודיו גבוהה', 'שחרורים חדשים כל שבוע'],
        createdBy: 'system'
      },
      {
        id: 'hasod-downloader',
        name: 'Hasod Downloader',
        nameHe: 'מוריד הסוד',
        description: 'Download high-quality music from YouTube, Spotify, SoundCloud, and Bandcamp with Hebrew transliteration support',
        descriptionHe: 'הורדת מוזיקה באיכות גבוהה מיוטיוב, ספוטיפיי, סאונדקלאוד ו-Bandcamp עם תמיכה בתעתיק עברי',
        paypalPlanId: '', // To be created
        pricePerMonth: 10,
        currency: 'USD',
        googleGroupEmail: 'hasod-downloader-members@hasodonline.com',
        active: true,
        order: 2,
        features: [
          'YouTube, Spotify, SoundCloud & Bandcamp support',
          'Always 320kbps MP3 quality',
          'Automatic metadata & album art',
          'Hebrew filename transliteration',
          'Album/playlist batch downloads',
          'Files available for 24 hours'
        ],
        featuresHe: [
          'תמיכה ביוטיוב, ספוטיפיי, סאונדקלאוד ו-Bandcamp',
          'תמיד באיכות MP3 320kbps',
          'מטה-דאטה ועטיפת אלבום אוטומטית',
          'תעתיק שמות קבצים עבריים',
          'הורדות קבוצתיות של אלבומים ופלייליסטים',
          'קבצים זמינים למשך 24 שעות'
        ],
        createdBy: 'system'
      }
    ];

    const results = [];
    for (const serviceData of SERVICES) {
      const { id, ...data } = serviceData;
      await admin.firestore().collection('services').doc(id).set({
        ...data,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      results.push(id);
    }

    res.json({ success: true, message: 'Services seeded', services: results });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Download Service Endpoints
// ============================================================================

/**
 * POST /download/submit
 * Submits a new download job
 */
app.post('/download/submit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { uid, url, transliterate = false } = req.body;

    if (!uid || !url) {
      return res.status(400).json({ error: 'Missing required fields: uid, url' });
    }

    // Check if user has active subscription to hasod-downloader
    const user = await FirestoreService.getUser(uid);
    const hasodDownloaderStatus = user.services?.['hasod-downloader']?.status;

    if (hasodDownloaderStatus !== 'active') {
      return res.status(403).json({
        error: 'Active subscription to Hasod Downloader required',
        requiresSubscription: true
      });
    }

    // Import and use download manager
    const { getDownloadManagerService } = await import('./services/download-manager.service');
    const downloadManager = getDownloadManagerService();

    const result = await downloadManager.createJob(uid, url, transliterate);

    res.json({
      success: true,
      jobId: result.jobId,
      estimatedTracks: result.estimatedTracks,
      message: 'Download job created'
    });
  } catch (error: any) {
    console.error('❌ Download submit error:', error);
    next(error);
  }
});

/**
 * GET /download/status/:jobId
 * Gets the status of a download job
 */
app.get('/download/status/:jobId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId } = req.params;
    const { uid } = req.query;

    if (!uid) {
      return res.status(400).json({ error: 'Missing required parameter: uid' });
    }

    const { getDownloadManagerService } = await import('./services/download-manager.service');
    const downloadManager = getDownloadManagerService();

    const job = await downloadManager.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.uid !== uid) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json({ job });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /download/history
 * Gets the user's download history
 */
app.get('/download/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { uid, limit = '30' } = req.query;

    if (!uid) {
      return res.status(400).json({ error: 'Missing required parameter: uid' });
    }

    const { getDownloadManagerService } = await import('./services/download-manager.service');
    const downloadManager = getDownloadManagerService();

    const jobs = await downloadManager.getUserJobs(uid as string, parseInt(limit as string));

    res.json({ jobs });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /download/:jobId
 * Deletes a download job and its files
 */
app.delete('/download/:jobId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId } = req.params;
    const { uid } = req.body;

    if (!uid) {
      return res.status(400).json({ error: 'Missing required field: uid' });
    }

    const { getDownloadManagerService } = await import('./services/download-manager.service');
    const downloadManager = getDownloadManagerService();

    await downloadManager.deleteJob(jobId, uid);

    res.json({ success: true, message: 'Job deleted' });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Export Cloud Function (2nd Gen)
// ============================================================================

export const api = onRequest(
  {
    memory: '1GiB', // Increased to handle large downloads and conversions
    timeoutSeconds: 540, // 9 minutes (max for 2nd Gen Cloud Functions)
    maxInstances: 10,
  },
  app
);
