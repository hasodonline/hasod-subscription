/**
 * Seed Services Collection
 * Initializes the services collection with default services
 *
 * Run with: npm run seed-services
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin
const serviceAccount = require('../../service-account-key.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'hasod-41a23'
});

const db = admin.firestore();

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
    features: [
      'Unlimited music streaming',
      'Download access',
      'Google Drive integration',
      'High-quality audio',
      'New releases every week'
    ],
    featuresHe: [
      'הזרמת מוזיקה ללא הגבלה',
      'אפשרות הורדה',
      'אינטגרציה עם Google Drive',
      'איכות אודיו גבוהה',
      'שחרורים חדשים כל שבוע'
    ],
    createdBy: 'system'
  },
  {
    id: 'hasod-downloader',
    name: 'Hasod Downloader',
    nameHe: 'מוריד הסוד',
    description: 'Download songs by providing a link - coming soon!',
    descriptionHe: 'הורדת שירים על ידי מתן קישור - בקרוב!',
    paypalPlanId: '', // To be configured later
    pricePerMonth: 15,
    currency: 'USD',
    googleGroupEmail: '', // No group for this service yet
    active: false, // Not available yet
    order: 2,
    features: [
      'On-demand song downloads',
      'Multiple audio formats (MP3, FLAC, WAV)',
      'Fast processing',
      'Batch downloads',
      'Quality selection'
    ],
    featuresHe: [
      'הורדות שירים לפי דרישה',
      'פורמטים מרובים (MP3, FLAC, WAV)',
      'עיבוד מהיר',
      'הורדות קבוצתיות',
      'בחירת איכות'
    ],
    createdBy: 'system'
  }
];

async function seedServices() {
  console.log('🌱 Seeding services collection...\n');

  for (const serviceData of SERVICES) {
    try {
      const { id, ...data } = serviceData;

      await db.collection('services').doc(id).set({
        ...data,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`✅ Created service: ${id} (${serviceData.nameHe})`);
    } catch (error) {
      console.error(`❌ Failed to create service ${serviceData.id}:`, error);
    }
  }

  console.log('\n🎉 Services seeding complete!');
  console.log('\nCreated services:');
  SERVICES.forEach(s => {
    console.log(`  - ${s.id}: ${s.nameHe} (${s.active ? 'ACTIVE' : 'INACTIVE'})`);
  });

  process.exit(0);
}

seedServices().catch((error) => {
  console.error('💥 Seeding failed:', error);
  process.exit(1);
});
