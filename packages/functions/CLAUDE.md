# Cloud Functions Backend - Hasod Subscription System

## TL;DR

**What:** Firebase Cloud Functions v2 backend API (Node.js 20, Express.js)
**Commands:**
- `npm run build` - Build TypeScript to JavaScript
- `npm run functions:serve` - Run local emulator
- `firebase deploy --only functions` - Deploy to production

**Key Files:**
- Entry: `src/index.ts` (Express app + routes)
- Services: `src/services/` (business logic)
- Config: `src/utils/config.ts`

**API Base:** `https://us-central1-hasod-41a23.cloudfunctions.net/api`

## Project Structure

```
packages/functions/
├── src/
│   ├── index.ts              # Main Express app & routes
│   ├── services/             # Business logic
│   │   ├── paypal.service.ts
│   │   ├── subscription.service.ts
│   │   ├── spotify.downloader.ts
│   │   ├── youtube.downloader.ts
│   │   ├── download-manager.service.ts
│   │   ├── google-groups.service.ts
│   │   └── storage.service.ts
│   ├── utils/
│   │   ├── config.ts         # Environment config
│   │   └── errors.ts         # Error handling
│   └── google-groups-implementation.ts
├── lib/                      # Compiled JS (gitignored)
├── bin/                      # yt-dlp binary
├── .env.yaml                 # Secrets (gitignored)
├── tsconfig.json
└── package.json
```

## Quick Start

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run locally
npm run functions:serve
# API available at: http://localhost:5001/hasod-41a23/us-central1/api

# Deploy to production
firebase deploy --only functions
```

## API Endpoints

### Public Endpoints

**GET /services**
- Get list of available subscription services
- No auth required
- Returns: Array of ServiceConfig objects

**POST /subscribe**
- Create PayPal subscription
- Auth: Firebase Auth token
- Body: `{ serviceId, planId, returnUrl, cancelUrl }`

**POST /webhooks/paypal**
- PayPal webhook handler
- Processes subscription events
- Logs to `webhookEvents` collection

### User Endpoints (Auth Required)

**GET /user/subscriptions**
- Get user's active subscriptions
- Auth: Firebase Auth token
- Returns: User document with services

**GET /user/subscription-status**
- Get subscription status (for desktop app)
- Auth: Bearer token OR email param
- Returns: `{ email, services: {...} }`

**POST /cancel-subscription**
- Cancel PayPal subscription
- Body: `{ serviceId }`

### Admin Endpoints

**GET /admin/users**
- List all users
- Admin check: Email in ADMIN_EMAILS

**POST /admin/manual-payment**
- Process manual payment
- Creates transaction, updates subscription

**POST /admin/cancel-subscription**
- Admin cancel subscription

### Download Endpoints

**POST /download/create**
- Create download job
- Supports YouTube, Spotify, SoundCloud
- Returns: `{ jobId }`

**GET /download/:jobId**
- Check download status
- Returns: Progress and download URL

**DELETE /download/:jobId**
- Cancel download job

## Environment Configuration

### Required Variables (.env.yaml)

```yaml
# PayPal
PAYPAL_CLIENT_ID: "xxx"
PAYPAL_CLIENT_SECRET: "xxx"
PAYPAL_SANDBOX: "false"

# Spotify
SPOTIFY_CLIENT_ID: "xxx"
SPOTIFY_CLIENT_SECRET: "xxx"

# OpenAI (for transliteration)
OPENAI_API_KEY: "xxx"

# Google Workspace
GOOGLE_SERVICE_ACCOUNT_KEY: '{...json...}'
GOOGLE_ADMIN_EMAIL: "hasod@hasodonline.com"

# Proxy (for downloads)
PROXY_ENABLED: "true"
PROXY_HOST: "gate.decodo.com"
PROXY_PORT_MIN: "10001"
PROXY_PORT_MAX: "10040"
PROXY_USERNAME: "xxx"
PROXY_PASSWORD: "xxx"
```

### Setting Secrets

```bash
# Via Firebase CLI
firebase functions:config:set \
  paypal.client_id="xxx" \
  paypal.client_secret="xxx"

# Via .env.yaml (preferred for v2)
# Edit packages/functions/.env.yaml
```

## Key Services

### PayPal Service
**File:** `src/services/paypal.service.ts`

**Functions:**
- `createSubscription()` - Create PayPal subscription
- `cancelSubscription()` - Cancel subscription
- `handleWebhook()` - Process webhook events

**Webhook Events:**
- `BILLING.SUBSCRIPTION.ACTIVATED` - Activate subscription
- `BILLING.SUBSCRIPTION.CANCELLED` - Cancel subscription
- `BILLING.SUBSCRIPTION.EXPIRED` - Expire subscription

### Subscription Service
**File:** `src/services/subscription.service.ts`

**Functions:**
- `getUserSubscriptions()` - Get user's subscriptions
- `updateSubscriptionStatus()` - Update status
- `checkExpiration()` - Check if expired

### Download Services

**YouTube:** `src/services/youtube.downloader.ts`
- Uses bundled yt-dlp binary
- Android client extractor (2025 anti-bot)
- Proxy rotation support
- Audio-only download

**Spotify:** `src/services/spotify.downloader.ts`
- Spotify Web API integration
- Retry logic with exponential backoff
- Proxy rotation
- Searches YouTube for actual download

**Manager:** `src/services/download-manager.service.ts`
- Job queue management
- Progress tracking
- File storage in Firebase Storage

### Google Groups Service
**File:** `src/services/google-groups.service.ts`

**Functions:**
- `addUserToGroup()` - Add member
- `removeUserFromGroup()` - Remove member
- `isUserInGroup()` - Check membership

**Integration:**
- Requires Google Workspace domain-wide delegation
- Service account with Admin SDK access

## Common Tasks

### Adding New Endpoint

1. Add route in `src/index.ts`:
```typescript
app.get('/new-endpoint', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await yourService.doSomething();
    res.json(result);
  } catch (error) {
    next(error);
  }
});
```

2. Build: `npm run build`
3. Test locally: `npm run functions:serve`
4. Deploy: `firebase deploy --only functions`

### Adding New Service

1. Create `src/services/new-service.ts`:
```typescript
export class NewService {
  async doSomething() {
    // Implementation
  }
}

export const newService = new NewService();
```

2. Import in `index.ts`
3. Use in route handlers

### Accessing Firestore

```typescript
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Get document
const userDoc = await db.collection('users').doc(email).get();
const userData = userDoc.data();

// Update document
await db.collection('users').doc(email).update({
  'services.serviceId.status': 'active'
});

// Query collection
const snapshot = await db.collection('transactions')
  .where('userId', '==', email)
  .get();
```

### Using Shared Types

```typescript
import { UserSubscription, ServiceConfig } from '../../../shared/src/types';

function processSubscription(sub: UserSubscription) {
  // Type-safe subscription handling
}
```

## Testing

### Local Emulator

```bash
# Start emulator
npm run functions:serve

# Test endpoint
curl http://localhost:5001/hasod-41a23/us-central1/api/services

# Test with auth
curl -H "Authorization: Bearer xxx" \
  http://localhost:5001/hasod-41a23/us-central1/api/user/subscriptions
```

### Testing PayPal Integration

1. Use PayPal Sandbox
2. Set `PAYPAL_SANDBOX="true"`
3. Configure webhook URL in PayPal Dashboard
4. Use sandbox test accounts

### Testing Downloads

```bash
curl -X POST http://localhost:5001/.../api/download/create \
  -H "Content-Type: application/json" \
  -d '{"url":"https://youtube.com/watch?v=xxx","format":"mp3"}'
```

## Deployment

### Pre-Deployment Checklist

- [ ] Code builds without errors: `npm run build`
- [ ] Environment variables set in `.env.yaml`
- [ ] Firestore indexes created
- [ ] Test in emulator first
- [ ] Check logs for errors

### Deploy Commands

```bash
# Deploy functions only
firebase deploy --only functions

# Deploy specific function
firebase deploy --only functions:api

# View logs
firebase functions:log

# View specific function logs
firebase functions:log --only api
```

### Post-Deployment

1. Test production endpoint
2. Check Firebase Console logs
3. Verify webhook delivery (PayPal)
4. Test critical flows

## Configuration Details

### Function Settings (index.ts)

```typescript
export const api = onRequest(
  {
    memory: '1GiB',           // Increased for downloads
    timeoutSeconds: 540,      // 9 minutes max
    maxInstances: 10,
  },
  app
);
```

### CORS Configuration

Currently allows all origins (update for production):
```typescript
app.use(cors({ origin: true }));
```

### Error Handling

Global error handler in `index.ts`:
```typescript
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});
```

## Firestore Collections

### users
```typescript
{
  email: string,
  displayName: string,
  services: {
    [serviceId]: {
      status: 'active' | 'expired' | 'cancelled',
      paymentMethod: 'paypal' | 'manual',
      paypalSubscriptionId?: string,
      startDate: Timestamp,
      nextBillingDate?: Timestamp,
      manualEndDate?: Timestamp
    }
  }
}
```

### services
```typescript
{
  id: string,
  name: string,
  nameHe: string,
  paypalPlanId: string,
  pricePerMonth: number,
  currency: string,
  active: boolean,
  googleGroupEmail?: string,
  features: string[],
  featuresHe: string[]
}
```

### transactions
```typescript
{
  id: string,
  userId: string,
  serviceId: string,
  amount: number,
  currency: string,
  type: 'paypal_subscription' | 'manual_payment',
  status: 'completed' | 'pending' | 'failed',
  timestamp: Timestamp,
  receiptUrl?: string
}
```

### webhookEvents
```typescript
{
  eventType: string,
  eventId: string,
  resource: object,
  timestamp: Timestamp,
  processed: boolean
}
```

## Troubleshooting

### "Function not responding"
```bash
firebase functions:log
# Check for errors in logs
```

### "Module not found"
```bash
npm install
npm run build
```

### "Environment variable not set"
```bash
# Check .env.yaml exists
cat packages/functions/.env.yaml

# Or use functions:config
firebase functions:config:get
```

### "PayPal webhook not working"
1. Check PayPal Dashboard webhook configuration
2. Verify webhook URL: `https://.../api/webhooks/paypal`
3. Check `webhookEvents` collection in Firestore
4. Review function logs

### "Download fails"
- Check proxy configuration
- Verify yt-dlp binary exists in `bin/`
- Check Spotify API credentials
- Review download service logs

## Code Style

### TypeScript
- Strict mode enabled
- Explicit return types
- Interface definitions
- Async/await (no callbacks)

### Services
- One service per file
- Export singleton instance
- Error handling in every method
- Logging for important operations

### Route Handlers
- Thin handlers (delegate to services)
- Try/catch with next(error)
- Input validation
- Consistent response format

## Security

### Current Implementation
- Firebase Auth required for user endpoints
- Admin email check for admin endpoints
- PayPal webhook signature (TODO)
- CORS (currently permissive)

### TODO
- [ ] Add webhook signature verification
- [ ] Restrict CORS origins
- [ ] Add rate limiting
- [ ] Implement JWT for admin endpoints

## Related Documentation

- [Root CLAUDE.md](../../CLAUDE.md) - Project overview
- [Webapp CLAUDE.md](../webapp/CLAUDE.md) - Frontend
- [Shared CLAUDE.md](../shared/CLAUDE.md) - Shared types
- [Architecture](../../docs/ARCHITECTURE.md) - System design
- [API Docs](../../docs/API.md) - Full API reference

---

**Package:** @hasod/functions
**Runtime:** Node.js 20 (Firebase Functions v2)
**Framework:** Express.js
