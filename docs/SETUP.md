# Complete Setup Guide

This guide will walk you through setting up the Hasod Subscription Management system from scratch.

## Prerequisites

- **Node.js 20+** and npm
- **Firebase CLI** - `npm install -g firebase-tools`
- **Firebase Project** with Blaze plan (pay-as-you-go)
- **PayPal Developer Account** - https://developer.paypal.com
- **Google Workspace** (optional, for Google Groups integration)
- **Git** for version control

## Step 1: Firebase Project Setup

### 1.1 Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Add project"
3. Enter project name (e.g., "hasod-subscription")
4. Enable Google Analytics (optional)
5. Create project
6. Upgrade to Blaze plan (required for Cloud Functions)

### 1.2 Enable Firebase Services

**Authentication:**
1. Go to Authentication → Sign-in method
2. Enable Google provider
3. Configure OAuth consent screen if prompted
4. Add authorized domains for production

**Firestore Database:**
1. Go to Firestore Database
2. Click "Create database"
3. Start in production mode
4. Choose location (us-central1 recommended)

**Cloud Functions:**
1. Already enabled with Blaze plan
2. Note your project ID for later

### 1.3 Get Firebase Configuration

1. Go to Project Settings → General
2. Scroll to "Your apps"
3. Click "Add app" → Web
4. Register app (e.g., "Hasod Web")
5. Copy the config object

## Step 2: Local Project Setup

### 2.1 Clone and Install

```bash
# Clone repository
git clone <repository-url>
cd hasod-subscription

# Install dependencies
npm install
cd functions && npm install && cd ..
```

### 2.2 Configure Environment

Create `.env` file in project root:

```bash
cp .env.example .env
```

Edit `.env` with your Firebase config:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
VITE_FUNCTIONS_URL=http://localhost:5001/your-project/us-central1/api
```

### 2.3 Firebase CLI Setup

```bash
# Login to Firebase
firebase login

# Initialize Firebase in project
firebase use --add
# Select your project from list

# View current project
firebase projects:list
```

## Step 3: PayPal Configuration

### 3.1 Create PayPal App

1. Go to [PayPal Developer Dashboard](https://developer.paypal.com/dashboard)
2. Navigate to "My Apps & Credentials"
3. Click "Create App"
4. Enter app name (e.g., "Hasod Subscriptions")
5. Choose "Merchant" app type
6. Create app
7. Copy **Client ID** and **Secret** (keep secret secure!)

### 3.2 Create Subscription Plans

1. Go to "Subscriptions" in PayPal Dashboard
2. Click "Create Plan"
3. Configure:
   - **Plan Name:** Music Library Access
   - **Billing Cycle:** Monthly
   - **Price:** $10 USD
   - **Status:** Active
4. Save and copy **Plan ID** (starts with `P-`)
5. Repeat for other services

### 3.3 Configure Firebase Functions

```bash
# Set PayPal credentials
firebase functions:config:set \
  paypal.client_id="YOUR_PAYPAL_CLIENT_ID" \
  paypal.client_secret="YOUR_PAYPAL_CLIENT_SECRET" \
  paypal.sandbox="true" \
  app.url="http://localhost:5000"

# Verify configuration
firebase functions:config:get
```

**For production:**
```bash
firebase functions:config:set \
  paypal.sandbox="false" \
  app.url="https://your-project.web.app"
```

### 3.4 Configure Webhooks (After Deployment)

After deploying functions:

1. Go to PayPal Developer Dashboard → Webhooks
2. Click "Add Webhook"
3. **Webhook URL:** `https://us-central1-YOUR-PROJECT.cloudfunctions.net/api/paypal-webhook`
4. **Event types:** Subscribe to:
   - `BILLING.SUBSCRIPTION.ACTIVATED`
   - `BILLING.SUBSCRIPTION.CANCELLED`
   - `BILLING.SUBSCRIPTION.EXPIRED`
   - `BILLING.SUBSCRIPTION.SUSPENDED`
5. Save webhook

## Step 4: Initialize Services

### 4.1 Seed Service Catalog

```bash
npm run seed-services
```

This creates initial services in Firestore:
- Music Library ($10/month)
- Hasod Downloader ($15/month)

### 4.2 Update Service PayPal Plan IDs

After seeding, update services with your PayPal plan IDs:

1. Go to Firebase Console → Firestore
2. Open `services` collection
3. Edit each service document
4. Update `paypalPlanId` with your plan IDs from Step 3.2

## Step 5: Deploy Security Rules

```bash
firebase deploy --only firestore:rules
```

This deploys Firestore security rules that:
- Allow users to read/write their own data
- Allow admins to read all data
- Protect admin-only collections

## Step 6: Local Development

### 6.1 Start Development Servers

Terminal 1 - Frontend:
```bash
npm run dev
```

Terminal 2 - Functions (optional):
```bash
npm run functions:build
firebase emulators:start --only functions
```

### 6.2 Access Application

- Frontend: http://localhost:5000
- Functions: http://localhost:5001/YOUR-PROJECT/us-central1/api

### 6.3 Test User Flow

1. Sign in with Google
2. Complete profile (name + phone)
3. Go to Subscriptions page
4. See services loaded
5. Try subscribing (use PayPal Sandbox account)

## Step 7: Production Deployment

### 7.1 Build Project

```bash
# Build Functions
npm run functions:build

# Build Frontend
npm run build
```

### 7.2 Deploy Everything

```bash
# Deploy all at once
firebase deploy

# Or deploy individually
firebase deploy --only hosting     # Frontend
firebase deploy --only functions   # Backend
firebase deploy --only firestore:rules  # Security rules
```

### 7.3 Verify Deployment

1. Visit your deployed URL: https://YOUR-PROJECT.web.app
2. Test sign-in
3. Check services load
4. Test PayPal subscription flow

### 7.4 Update Configuration

```bash
# Update app URL for production
firebase functions:config:set app.url="https://YOUR-PROJECT.web.app"

# Switch to live PayPal
firebase functions:config:set paypal.sandbox="false"

# Redeploy functions
firebase deploy --only functions
```

### 7.5 Configure PayPal Webhooks

Update webhook URL in PayPal Dashboard (see Step 3.4)

### 7.6 Configure GitHub Secrets (for CI/CD)

If using GitHub Actions for automated deployment:

1. Go to your GitHub repository
2. Navigate to Settings → Secrets and variables → Actions
3. Click "New repository secret" and add the following secrets:

**Required Secrets:**
- `FIREBASE_SERVICE_ACCOUNT` - Firebase service account JSON (for deployment)
- `PAYPAL_CLIENT_ID` - Your PayPal Client ID
- `PAYPAL_CLIENT_SECRET` - Your PayPal Client Secret
- `GOOGLE_SERVICE_ACCOUNT_KEY` - Google service account JSON (single line)
- `OPENAI_API_KEY` - OpenAI API key (for transliteration service)
- `DEEZER_ARL` - Deezer ARL token (for download service)

**How to get FIREBASE_SERVICE_ACCOUNT:**
```bash
# Create a service account for GitHub Actions
firebase projects:list
# Go to Firebase Console → Project Settings → Service Accounts
# Click "Generate New Private Key"
# Copy the entire JSON content and paste as GitHub secret
```

**How to get DEEZER_ARL:**
1. Login to Deezer in your browser
2. Open Developer Tools (F12)
3. Go to Application → Cookies → deezer.com
4. Find the `arl` cookie and copy its value
5. Paste the value as the `DEEZER_ARL` secret

The GitHub Actions workflow (`.github/workflows/deploy.yml`) will automatically use these secrets during deployment.

## Step 8: Configure Admin Access

### 8.1 Update Admin Emails

Edit admin email list in two places:

**Frontend:** `src/App.tsx`
```typescript
const ADMIN_EMAILS = [
  'your-admin-email@example.com',
  'another-admin@example.com'
];
```

**Security Rules:** `firestore.rules`
```javascript
function isAdmin() {
  return request.auth != null &&
         (request.auth.token.email == 'your-admin-email@example.com' ||
          request.auth.token.email == 'another-admin@example.com');
}
```

### 8.2 Redeploy

```bash
npm run build
firebase deploy --only hosting,firestore:rules
```

## Step 9: Google Groups Integration (Optional)

### 9.1 Prerequisites

- Google Workspace account (not regular Gmail)
- Admin access to Google Workspace
- Google Group created (e.g., `members@yourdomain.com`)

### 9.2 Create Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your Firebase project
3. Go to IAM & Admin → Service Accounts
4. Click "Create Service Account"
5. Name: `google-groups-manager`
6. Click "Create and Continue"
7. Skip role assignment
8. Click "Done"

### 9.3 Create Service Account Key

1. Click on the service account
2. Go to "Keys" tab
3. Click "Add Key" → "Create new key"
4. Choose JSON format
5. Download and save securely
6. **DO NOT commit to git**

### 9.4 Enable Domain-Wide Delegation

1. In service account details, enable "G Suite Domain-wide Delegation"
2. Note the **Client ID** (numeric)

### 9.5 Enable Admin SDK API

1. Go to APIs & Services → Library
2. Search "Admin SDK API"
3. Click and enable it

### 9.6 Configure Google Workspace

1. Go to [Google Workspace Admin Console](https://admin.google.com)
2. Security → Access and data control → API controls
3. Click "Manage Domain-Wide Delegation"
4. Click "Add new"
5. Enter Client ID from step 9.4
6. OAuth scopes: `https://www.googleapis.com/auth/admin.directory.group.member`
7. Authorize

### 9.7 Configure Firebase Functions

```bash
# Upload service account key
firebase functions:secrets:set GOOGLE_SERVICE_ACCOUNT < service-account-key.json

# Set admin email for impersonation
firebase functions:config:set google.admin_email="admin@yourdomain.com"

# Redeploy
firebase deploy --only functions
```

### 9.8 Update Services

In Firestore, update each service document with `googleGroupEmail`:

```json
{
  "googleGroupEmail": "members@yourdomain.com"
}
```

### 9.9 Test

Try subscribing and check if user is automatically added to Google Group.

## Troubleshooting

### Can't Deploy Functions

**Error:** Missing billing account
- Ensure project is on Blaze plan

**Error:** Permission denied
- Run `firebase login` again
- Check project selection: `firebase use`

### Services Not Loading

**Problem:** Empty services list
- Run `npm run seed-services`
- Check Firestore in Firebase Console
- Check browser console for errors

### PayPal Subscription Not Working

**Problem:** Subscription not activating
- Verify PayPal credentials: `firebase functions:config:get`
- Check PayPal plan IDs match
- Check webhook configuration
- View logs: `firebase functions:log`

### Google Groups Not Working

**Problem:** Users not added automatically
- Verify service account setup (Step 9)
- Check domain-wide delegation
- Check function logs for errors
- May need manual addition as fallback

## Next Steps

After successful setup:

1. **Customize Services** - Edit in Firestore or create Developer page
2. **Test Full Flow** - Complete subscription with test PayPal account
3. **Configure Monitoring** - Set up Firebase alerts
4. **Add Team Members** - Update admin email list
5. **Plan Marketing** - Prepare for user onboarding

## Maintenance

### Update Dependencies

```bash
npm update
cd functions && npm update && cd ..
```

### View Logs

```bash
# All function logs
firebase functions:log

# Specific function
firebase functions:log --only api

# Real-time streaming
firebase functions:log --tail
```

### Backup Data

```bash
# Export Firestore
gcloud firestore export gs://YOUR-BUCKET-NAME/backups

# Automated backups (set up in Google Cloud Console)
```

## Support

- **Documentation:** Check README.md, ARCHITECTURE.md, API.md
- **Issues:** Open GitHub issue
- **Email:** hasod@hasodonline.com

---

Setup complete! You should now have a fully functional subscription management system.
