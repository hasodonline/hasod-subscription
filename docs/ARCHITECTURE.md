# System Architecture

## Overview

Hasod Subscription Management is a serverless, full-stack application built on Firebase with React frontend and Node.js Cloud Functions backend. The system supports multi-service subscriptions with dual payment methods (PayPal + manual).

## Architecture Diagram

```
┌─────────────┐
│   Browser   │
│  (React)    │
└──────┬──────┘
       │ HTTPS
       │
┌──────▼──────────────────────────────────────┐
│     Firebase Hosting (Static Assets)        │
└──────┬──────────────────────────────────────┘
       │
       │ Firebase SDK / REST API
       │
┌──────▼─────────┐      ┌───────────────────┐
│   Firebase     │      │   Cloud Functions │
│   Services     │◄─────┤   (Express API)   │
│                │      └─────────┬─────────┘
│  • Auth        │                │
│  • Firestore   │                │ HTTPS
│  • Hosting     │                │
└────────────────┘      ┌─────────▼──────────┐
                        │  External Services │
                        │  • PayPal API      │
                        │  • Google API      │
                        └────────────────────┘
```

## Technology Stack

### Frontend
- **React 18.3** - UI framework
- **TypeScript 5.7** - Type safety
- **Vite 7.3** - Build tool and dev server
- **React Router DOM 7.11** - Client-side routing
- **Axios 1.7** - HTTP client
- **Firebase SDK 11.2** - Auth & Firestore client

### Backend
- **Firebase Cloud Functions** - Serverless compute (Node.js 20, Gen 2)
- **Express.js 4.22** - HTTP framework
- **Firebase Admin SDK 13.6** - Backend services
- **TypeScript 5.7** - Type safety

### Data & Services
- **Firebase Firestore** - NoSQL database
- **Firebase Authentication** - Google OAuth
- **PayPal Billing Plans API** - Payment processing
- **Google Workspace Admin API** - Group management

## Data Models

### Firestore Collections

#### 1. `users/{uid}`
User profiles with nested services subscriptions.

```typescript
{
  uid: string;
  email: string;
  name: string;
  phone: string;
  services: {
    [serviceId: string]: {
      status: 'active' | 'pending' | 'canceled' | 'expired' | 'suspended' | 'none';
      paymentMethod: 'paypal' | 'manual';

      // PayPal fields
      paypalSubscriptionId?: string;
      paypalSubscriptionStatus?: string;

      // Manual payment fields
      manualStartDate?: Timestamp;
      manualEndDate?: Timestamp;
      manualTransactionId?: string;

      // Google Group membership
      inGoogleGroup?: boolean;

      // Timestamps
      activatedAt?: Timestamp;
      expiresAt?: Timestamp;
      updatedAt: Timestamp;
    }
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### 2. `services/{id}`
Service catalog and configuration.

```typescript
{
  id: string;                    // 'music-library', 'hasod-downloader'
  name: string;                  // 'Music Library Access'
  nameHe: string;                // 'גישה לספריית המוזיקה'
  description: string;
  descriptionHe: string;
  paypalPlanId: string;          // PayPal billing plan ID
  pricePerMonth: number;
  currency: 'USD' | 'ILS';
  googleGroupEmail?: string;     // Optional Google Group for this service
  active: boolean;               // Is service available
  order: number;                 // Display order
  features: string[];            // English features
  featuresHe: string[];          // Hebrew features
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;             // Admin UID who created
}
```

#### 3. `subscriptionMappings/{subscriptionId}`
Maps PayPal subscription IDs to users and services for fast webhook processing.

```typescript
{
  subscriptionId: string;        // PayPal subscription ID ('I-ABC123')
  userId: string;                // Firebase user UID
  serviceId: string;             // Service ID
  planId: string;                // PayPal plan ID (for reference)
  customId: string;              // 'userId:serviceId' (sent to PayPal)
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### 4. `manualTransactions/{id}`
Manual payment records processed by admins.

```typescript
{
  id: string;                    // Auto-generated
  userId: string;
  userEmail: string;
  serviceId: string;
  serviceName: string;
  amount: number;
  currency: 'USD' | 'ILS';
  durationMonths: number;        // Subscription duration
  startDate: Timestamp;
  endDate: Timestamp;
  notes: string;                 // Admin notes
  processedBy: string;           // Admin UID
  processedByEmail: string;
  createdAt: Timestamp;
  paymentMethod: 'cash' | 'bank-transfer' | 'other';
  receiptNumber?: string;
}
```

#### 5. `webhookEvents/{id}`
PayPal webhook event logs for auditing.

```typescript
{
  eventId: string;               // PayPal event ID
  eventType: string;             // 'BILLING.SUBSCRIPTION.ACTIVATED'
  subscriptionId: string | null;
  status: string | null;
  payload: object;               // Complete webhook payload
  processedAt: Timestamp;
  processed: boolean;
  error: string | null;
  userId?: string;
  userEmail?: string;
}
```

## Service Layer Architecture

Backend follows service layer pattern for separation of concerns:

```
functions/src/
├── index.ts                    # HTTP routes (thin layer)
├── services/
│   ├── paypal.service.ts       # PayPal API integration
│   ├── google-groups.service.ts # Google Groups management
│   ├── firestore.service.ts    # Data access layer
│   ├── subscription.service.ts # Subscription business logic
│   └── transaction.service.ts  # Manual payment processing
└── utils/
    ├── config.ts               # Configuration management
    └── errors.ts               # Custom error classes
```

### Responsibilities

**index.ts (HTTP Layer)**
- Route definition
- Request validation
- Response formatting
- Error handling

**Services (Business Logic)**
- Core business operations
- External API calls
- Data validation
- Transaction management

**Utils (Infrastructure)**
- Configuration loading
- Error definitions
- Common helpers

## API Architecture

### Endpoint Structure

```
/api
├── /services (Public)
│   ├── GET /                   # List all services
│   └── GET /:serviceId         # Get specific service
│
├── /subscription (User)
│   ├── POST /create-subscription
│   ├── POST /activate-subscription
│   └── POST /paypal-webhook
│
└── /admin (Admin Only)
    ├── POST /services
    ├── DELETE /services/:serviceId
    ├── POST /manual-payment
    ├── GET /manual-transactions
    ├── POST /cancel-subscription
    ├── POST /manage-group
    └── POST /seed-services
```

## Data Flow

### PayPal Subscription Flow

```
1. User Action
   ├── User clicks "Subscribe with PayPal"
   └── Frontend calls POST /create-subscription {uid, serviceId}

2. Backend Processing
   ├── Lookup service from Firestore
   ├── Create PayPal subscription with custom_id='uid:serviceId'
   ├── Save to Firestore: users/{uid}/services/{serviceId}
   ├── Save mapping: subscriptionMappings/{subscriptionId}
   └── Return approval URL

3. PayPal Flow
   ├── User redirects to PayPal
   ├── User approves payment
   └── PayPal redirects back with subscription_id

4. Activation
   ├── Frontend calls POST /activate-subscription {uid, subscriptionId, serviceId}
   ├── Backend verifies with PayPal API
   ├── Updates user service status to 'active'
   ├── Adds user to Google Group (if configured)
   └── Returns success

5. Webhook Processing
   ├── PayPal sends webhook to POST /paypal-webhook
   ├── Backend parses custom_id='uid:serviceId'
   ├── Updates user service status
   └── Manages Google Group membership
```

### Manual Payment Flow

```
1. Admin Action
   ├── Admin opens ManualPaymentModal
   └── Fills form: userEmail, serviceId, amount, duration

2. Backend Processing
   ├── Find or create user by email
   ├── Calculate end date (start + duration)
   ├── Update user service status to 'active'
   ├── Create manualTransaction record
   ├── Add to Google Group (if configured)
   └── Return success

3. User Access
   ├── User service status updated
   └── User sees 'active' status on Subscriptions page
```

## Security Architecture

### Authentication
- Firebase Authentication (Google OAuth)
- JWT tokens issued by Firebase
- Admin check via email whitelist

### Authorization

**Firestore Rules:**
```javascript
- users/{uid}: User can read/write own doc, admins can read all
- services: Public read, admin write
- manualTransactions: Admin only
- subscriptionMappings: Admin only (Cloud Functions write)
- webhookEvents: Admin only (Cloud Functions write)
```

**API Security:**
- All endpoints require authentication (via Firebase)
- Admin endpoints check email against whitelist
- CORS configured (currently permissive, needs tightening)

### Known Security Issues
1. Admin endpoints lack JWT verification
2. PayPal webhook signature not verified
3. CORS allows all origins
4. No rate limiting

## Integration Points

### PayPal Integration

**Authentication:**
- OAuth 2.0 client credentials flow
- Access tokens cached for performance

**Key Operations:**
- Create subscription
- Get subscription details
- Cancel subscription
- Process webhook events

**Webhook Events Handled:**
- `BILLING.SUBSCRIPTION.ACTIVATED`
- `BILLING.SUBSCRIPTION.CANCELLED`
- `BILLING.SUBSCRIPTION.EXPIRED`
- `BILLING.SUBSCRIPTION.SUSPENDED`

### Google Workspace Integration

**Setup Required:**
- Service account with domain-wide delegation
- Admin SDK API enabled
- OAuth scopes: `admin.directory.group.member`

**Operations:**
- Add user to group
- Remove user from group
- List group members

**Current Status:** Placeholder implementation (logs to console)

## Scalability Considerations

### Current Limits
- Firestore: 10,000 writes/second per database
- Cloud Functions: 1,000 concurrent executions (Gen 2)
- Firebase Auth: 10,000 sign-ins/hour

### Optimization Strategies
1. **PayPal Token Caching** - Reduce API calls
2. **Firestore Indexes** - Fast webhook queries
3. **Subscription Mapping** - O(1) webhook processing
4. **CDN for Static Assets** - Firebase Hosting CDN

### Future Scaling
- Database sharding by region
- Function regional deployment
- Redis cache for hot data
- Queue-based webhook processing

## Monitoring & Observability

### Firebase Console
- Function invocations and errors
- Firestore read/write metrics
- Auth usage statistics

### Logging
- Structured JSON logs in Cloud Functions
- Webhook event logging in Firestore
- Transaction audit trail

### Key Metrics to Monitor
- Subscription activation success rate
- Webhook delivery latency
- Function execution time
- Database query performance
- PayPal API response time

## Deployment Architecture

### Environments
- **Development:** Local emulators + Firebase sandbox
- **Production:** Firebase live project

### Deployment Process
```bash
1. Build Functions: npm run functions:build
2. Build Frontend: npm run build
3. Deploy: firebase deploy (or --only hosting/functions)
```

### Configuration Management
- Frontend: Environment variables (.env)
- Backend: Firebase Functions config
- Secrets: Firebase Secrets Manager (planned)

## Error Handling

### Custom Error Classes
```typescript
- AppError: Base application error
- ValidationError: Input validation failures
- PayPalError: PayPal API errors
- FirestoreError: Database errors
```

### Error Flow
1. Error occurs in service layer
2. Service throws typed error
3. Express error handler catches
4. Formats response based on environment
5. Logs to Cloud Functions
6. Returns user-friendly message

## Future Architecture Considerations

1. **Microservices** - Split into payment, user, and admin services
2. **Message Queue** - Decouple webhook processing
3. **Caching Layer** - Redis for session and hot data
4. **Multi-Region** - Deploy functions globally
5. **GraphQL** - Replace REST API
6. **Real-time Updates** - WebSocket for live status
7. **CDN Integration** - CloudFlare for enhanced performance

---

This architecture supports the current requirements and provides a path for future scalability and feature additions.
