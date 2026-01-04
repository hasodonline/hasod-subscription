"use strict";
/**
 * Test script for Google Groups functionality
 * Run with: npm run test-groups
 */
Object.defineProperty(exports, "__esModule", { value: true });
const googleapis_1 = require("googleapis");
const GOOGLE_GROUP_EMAIL = 'hasod-online-member-v1@hasodonline.com';
const TEST_EMAIL = 'yubarkan@gmail.com';
async function testAddToGroup() {
    try {
        console.log(`\n🧪 Testing: Adding ${TEST_EMAIL} to ${GOOGLE_GROUP_EMAIL}\n`);
        // Get service account credentials from Firebase config
        // For local testing, you can load from file instead
        const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY ||
            require('fs').readFileSync('../service-account-key.json', 'utf8');
        const adminEmail = 'hasod@hasodonline.com';
        if (!serviceAccountKey) {
            throw new Error('Service account key not found');
        }
        // Parse the service account key
        const credentials = JSON.parse(serviceAccountKey);
        console.log(`✓ Service account loaded: ${credentials.client_email}`);
        console.log(`✓ Admin email (subject): ${adminEmail}`);
        // Create JWT client with domain-wide delegation
        const auth = new googleapis_1.google.auth.JWT({
            email: credentials.client_email,
            key: credentials.private_key,
            scopes: ['https://www.googleapis.com/auth/admin.directory.group.member'],
            subject: adminEmail // Impersonate this admin user
        });
        console.log(`✓ JWT client created with domain-wide delegation`);
        const adminClient = googleapis_1.google.admin({ version: 'directory_v1', auth });
        console.log(`\n📤 Attempting to add member to group...`);
        // Add member to group
        const result = await adminClient.members.insert({
            groupKey: GOOGLE_GROUP_EMAIL,
            requestBody: {
                email: TEST_EMAIL,
                role: 'MEMBER'
            }
        });
        console.log(`\n✅ SUCCESS! User added to group`);
        console.log(`Response:`, JSON.stringify(result.data, null, 2));
        return { success: true, message: 'User added successfully' };
    }
    catch (error) {
        console.error(`\n❌ ERROR:`, error.message);
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Data:`, JSON.stringify(error.response.data, null, 2));
        }
        if (error.code === 409) {
            console.log(`\n✓ User already in group (this is OK)`);
            return { success: true, message: 'User already in group' };
        }
        if (error.code === 403) {
            console.error(`\n⚠️  Permission denied. Possible issues:`);
            console.error(`   - Domain-wide delegation not enabled`);
            console.error(`   - OAuth scopes not authorized in Google Workspace Admin`);
            console.error(`   - Service account not authorized for this domain`);
        }
        if (error.code === 404) {
            console.error(`\n⚠️  Group not found: ${GOOGLE_GROUP_EMAIL}`);
            console.error(`   - Check if the group exists in Google Groups`);
            console.error(`   - Verify the email address is correct`);
        }
        return { success: false, message: error.message };
    }
}
// Run the test
testAddToGroup()
    .then((result) => {
    console.log(`\n🎯 Test completed:`, result);
    process.exit(0);
})
    .catch((error) => {
    console.error(`\n💥 Test failed:`, error);
    process.exit(1);
});
