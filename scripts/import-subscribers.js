const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin with Application Default Credentials
// Run: firebase login first
admin.initializeApp({
  projectId: 'hasod-41a23'
});

const db = admin.firestore();

// Parse CSV properly handling quoted fields
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Parse header
  const headers = parseCSVLine(lines[0]);

  const data = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    data.push(row);
  }

  return data;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

// Process all subscriptions for a single email
function consolidateUserData(subscriptions) {
  // Sort by date - most recent first
  subscriptions.sort((a, b) => {
    const dateA = new Date(a.lastPayDate || 0);
    const dateB = new Date(b.lastPayDate || 0);
    return dateB - dateA;
  });

  // Find the most recent ACTIVE subscription, or the most recent subscription
  const activeSubIndex = subscriptions.findIndex(s => s.status === 'active');
  const primarySub = activeSubIndex >= 0 ? subscriptions[activeSubIndex] : subscriptions[0];

  // Collect all subscription IDs
  const allSubscriptionIds = subscriptions.map(s => s.subscriptionId).filter(Boolean);

  return {
    email: primarySub.email,
    name: primarySub.name,
    phone: primarySub.phone,
    paypalSubscriptionId: primarySub.subscriptionId, // Most recent or active
    allSubscriptionIds: allSubscriptionIds, // All subscription IDs
    paypalSubscriptionStatus: primarySub.status,
    inGoogleGroup: primarySub.inGroup,
    lastPaymentDate: primarySub.lastPayDate,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

// Parse a single CSV row into a subscription record
function parseSubscriptionRow(row) {
  const formEmail = row['Form email']?.trim().toLowerCase();
  const paypalEmail = row['PayPal email']?.trim().toLowerCase();
  const formName = row['Form Name']?.trim();
  const paypalName = row['PayPal Name']?.trim();

  // Use Form email as primary identifier, fall back to PayPal email
  const email = formEmail || paypalEmail;
  if (!email) return null;

  // Use Form name if available, otherwise PayPal name
  const name = formName || paypalName || '';

  const status = row['Status']?.toUpperCase();
  let subscriptionStatus = 'none';
  if (status === 'ACTIVE') subscriptionStatus = 'active';
  else if (status === 'CANCELLED') subscriptionStatus = 'canceled';
  else if (status === 'SUSPENDED') subscriptionStatus = 'suspended';
  else if (status === 'EXPIRED') subscriptionStatus = 'expired';

  const inGroup = row['In Group']?.trim().toLowerCase() === 'yes';

  return {
    email,
    name,
    phone: row['Phone']?.trim() || '',
    subscriptionId: row['PayPal Sub ID']?.trim() || '',
    planId: row['Plan']?.trim() || '',
    status: subscriptionStatus,
    inGroup,
    lastPayDate: row['Last Pay (date)']?.trim() || ''
  };
}

async function importData() {
  console.log('📊 Starting import from existing.csv...\n');

  const csvPath = path.join(__dirname, '../existing.csv');
  const rows = parseCSV(csvPath);

  console.log(`📄 Found ${rows.length} rows in CSV\n`);

  // Group subscriptions by email
  const subscriptionsByEmail = new Map();

  for (const row of rows) {
    const subscription = parseSubscriptionRow(row);
    if (!subscription || !subscription.email) continue;

    const email = subscription.email;
    if (!subscriptionsByEmail.has(email)) {
      subscriptionsByEmail.set(email, []);
    }
    subscriptionsByEmail.get(email).push(subscription);
  }

  console.log(`👥 Found ${subscriptionsByEmail.size} unique users\n`);

  // Consolidate multiple subscriptions per user
  const users = [];
  for (const [email, subscriptions] of subscriptionsByEmail) {
    const userData = consolidateUserData(subscriptions);
    users.push(userData);
  }

  // Show statistics
  const stats = {
    total: users.length,
    active: 0,
    canceled: 0,
    suspended: 0,
    inGroup: 0,
    withMultipleSubs: 0
  };

  users.forEach(user => {
    if (user.paypalSubscriptionStatus === 'active') stats.active++;
    else if (user.paypalSubscriptionStatus === 'canceled') stats.canceled++;
    else if (user.paypalSubscriptionStatus === 'suspended') stats.suspended++;

    if (user.inGoogleGroup) stats.inGroup++;
    if (user.allSubscriptionIds.length > 1) stats.withMultipleSubs++;
  });

  console.log('📈 Import Statistics:');
  console.log(`  Total unique users: ${stats.total}`);
  console.log(`  Active subscriptions: ${stats.active}`);
  console.log(`  Canceled: ${stats.canceled}`);
  console.log(`  Suspended: ${stats.suspended}`);
  console.log(`  In Google Group: ${stats.inGroup}`);
  console.log(`  Users with multiple subs: ${stats.withMultipleSubs}`);
  console.log('');

  // Show sample data
  console.log('📋 Sample data (first 3 users):');
  users.slice(0, 3).forEach((user, i) => {
    console.log(`  ${i + 1}. ${user.name} (${user.email})`);
    console.log(`     Status: ${user.paypalSubscriptionStatus}`);
    console.log(`     Phone: ${user.phone}`);
    console.log(`     Subscriptions: ${user.allSubscriptionIds.length}`);
    console.log(`     In Group: ${user.inGoogleGroup}`);
  });
  console.log('');

  // Confirm import
  console.log('⚠️  This will import data to Firestore: hasod-41a23');
  console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('🚀 Starting import...\n');

  // Import to Firestore in batches
  let batch = db.batch();
  let batchCount = 0;
  let totalImported = 0;

  for (const user of users) {
    // Use email as document ID (sanitized to be Firestore-safe)
    const docId = user.email.replace(/[^a-zA-Z0-9@._-]/g, '_');
    const userRef = db.collection('users').doc(docId);

    batch.set(userRef, user);
    batchCount++;
    totalImported++;

    // Firestore batch limit is 500
    if (batchCount >= 500) {
      await batch.commit();
      console.log(`  ✅ Imported ${totalImported} users...`);
      batch = db.batch();
      batchCount = 0;
    }
  }

  // Commit remaining
  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`\n✅ Successfully imported ${totalImported} users to Firestore!\n`);
  console.log('📊 Final Summary:');
  console.log(`  Total imported: ${totalImported}`);
  console.log(`  Active: ${stats.active}`);
  console.log(`  Canceled: ${stats.canceled}`);
  console.log(`  Suspended: ${stats.suspended}`);
  console.log(`  In Google Group: ${stats.inGroup}\n`);
}

importData()
  .then(() => {
    console.log('✨ Import complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  });
