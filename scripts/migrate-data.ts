/**
 * Data Migration Script
 * Migrates users from old single-subscription schema to new multi-service schema
 *
 * Run with: npm run migrate-data
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin
const serviceAccount = require('../../service-account-key.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'hasod-41a23'
});

const db = admin.firestore();

interface OldUserData {
  email?: string;
  name?: string;
  phone?: string;
  paypalSubscriptionId?: string;
  paypalSubscriptionStatus?: string;
  inGoogleGroup?: boolean;
  [key: string]: any;
}

async function migrateUsers() {
  console.log('🔄 Starting user data migration...\n');

  const usersSnapshot = await db.collection('users').get();
  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  console.log(`Found ${usersSnapshot.docs.length} users to check\n`);

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const data = userDoc.data() as OldUserData;

    try {
      // Check if user already has new services structure
      if (data.services) {
        console.log(`⏭️  Skipping ${userId} (already migrated)`);
        skippedCount++;
        continue;
      }

      // Check if user has old subscription data to migrate
      if (!data.paypalSubscriptionId && !data.paypalSubscriptionStatus) {
        console.log(`⏭️  Skipping ${userId} (no subscription data)`);
        skippedCount++;
        continue;
      }

      console.log(`🔄 Migrating ${userId} (${data.email})...`);

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

      // If subscription is active, set activation date
      if (data.paypalSubscriptionStatus === 'active') {
        services['music-library'].activatedAt = admin.firestore.FieldValue.serverTimestamp();
      }

      // Update user document with new structure
      // Keep old fields for backward compatibility
      await userDoc.ref.update({
        services,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Create subscription mapping for legacy subscription
      // This ensures future webhooks can find the user/service
      if (data.paypalSubscriptionId) {
        const customId = `${userId}:music-library`;

        await db.collection('subscriptionMappings').doc(data.paypalSubscriptionId).set({
          subscriptionId: data.paypalSubscriptionId,
          userId: userId,
          serviceId: 'music-library',
          planId: 'P-4TS05390XU019010LNAY3XOI',
          customId: customId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`  ✅ Created subscription mapping for ${data.paypalSubscriptionId}`);
      }

      console.log(`✅ Migrated ${userId}`);
      migratedCount++;

    } catch (error) {
      console.error(`❌ Failed to migrate ${userId}:`, error);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Migration Summary:');
  console.log('='.repeat(60));
  console.log(`✅ Migrated: ${migratedCount}`);
  console.log(`⏭️  Skipped: ${skippedCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`📦 Total: ${usersSnapshot.docs.length}`);
  console.log('='.repeat(60) + '\n');

  if (migratedCount > 0) {
    console.log('🎉 Migration complete!\n');
    console.log('⚠️  IMPORTANT: Old fields (paypalSubscriptionId, etc.) were kept');
    console.log('   for backward compatibility. They can be removed in a future update.\n');
  }

  process.exit(0);
}

migrateUsers().catch((error) => {
  console.error('💥 Migration failed:', error);
  process.exit(1);
});
