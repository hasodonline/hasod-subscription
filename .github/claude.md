# Claude Code Instructions for Hasod Subscription Management

## Project Overview

**Name:** Hasod Subscription Management System
**Type:** Full-stack subscription platform with multi-service support
**Stack:** React + TypeScript + Firebase + PayPal + Google Workspace
**Status:** Production (80% complete, frontend polish needed)

### Core Functionality
- Multi-service subscription management (Music Library, Hasod Downloader)
- Dual payment methods: PayPal automatic subscriptions + manual payments
- Google Workspace integration for automated group management
- Admin dashboard for subscription and user management
- Developer panel for service configuration

---

## Project Structure

### Key Directories
```
/
├── src/                       # React frontend (TypeScript)
│   ├── pages/                 # Route components (Home, Profile, Subscriptions, Admin, Developer)
│   ├── components/            # Reusable UI components (ServiceCard, ManualPaymentModal)
│   ├── api/                   # API client layer (services, subscriptions, transactions)
│   ├── hooks/                 # Custom React hooks (useServices)
│   └── types/                 # TypeScript definitions (user.ts, service.ts)
│
├── functions/                 # Firebase Cloud Functions (Node.js 20, Gen 2)
│   └── src/
│       ├── index.ts           # HTTP API handler (Express)
│       ├── services/          # Business logic layer (6 service modules)
│       └── utils/             # Config & error handling
│
├── scripts/                   # One-time utilities (seed, migrate)
├── shared/                    # Shared types between frontend/backend
└── public/                    # Static assets

```

### Critical Files
- `src/App.tsx` - Main routing, auth state, onboarding, admin check
- `functions/src/index.ts` - All API endpoints, middleware
- `functions/src/services/subscription.service.ts` - Core subscription logic
- `firestore.rules` - Database security rules
- `firebase.json` - Firebase project configuration

---

## Architecture

### Tech Stack
**Frontend:**
- React 18.3 + TypeScript 5.7 + Vite 7.3
- Firebase SDK 11.2 (Auth, Firestore client)
- Axios 1.7 for HTTP requests
- React Router DOM 7.11

**Backend:**
- Firebase Cloud Functions (2nd Gen, Node.js 20)
- Express.js 4.22 for HTTP routing
- Firebase Admin SDK 13.6
- Google APIs SDK 169.0 for Workspace integration

**Services:**
- Firebase Firestore (NoSQL database)
- Firebase Authentication (Google OAuth)
- PayPal Billing Plans API
- Google Workspace Admin API

### Data Model

**Firestore Collections:**
1. `users/{uid}` - User profiles with nested services map
2. `services/{id}` - Service catalog (music-library, hasod-downloader)
3. `subscriptionMappings/{subscriptionId}` - PayPal subscription → user/service mapping
4. `manualTransactions/{id}` - Manual payment records
5. `webhookEvents/{id}` - PayPal webhook event logs

**User Document Structure:**
```typescript
{
  uid: string,
  email: string,
  name: string,
  phone: string,
  services: {
    [serviceId]: {
      status: 'active' | 'pending' | 'canceled' | 'expired' | 'none',
      paymentMethod: 'paypal' | 'manual',
      paypalSubscriptionId?: string,
      paypalSubscriptionStatus?: string,
      manualStartDate?: Timestamp,
      manualEndDate?: Timestamp,
      inGoogleGroup?: boolean,
      activatedAt?: Timestamp,
      updatedAt: Timestamp
    }
  }
}
```

---

## Development Workflow

### Setup
```bash
npm install
cd functions && npm install && cd ..
cp .env.example .env  # Configure Firebase & PayPal credentials
```

### Local Development
```bash
# Terminal 1: Frontend
npm run dev                              # http://localhost:5000

# Terminal 2: Functions (optional)
npm run functions:build && npm run functions:serve
```

### Build & Deploy
```bash
npm run functions:build                  # Compile TypeScript
npm run build                            # Build frontend
firebase deploy                          # Deploy all (or --only hosting/functions)
```

### Testing
- Frontend: `npm test`
- Functions: Manual testing with curl or Postman
- Firestore Rules: Firebase emulator

---

## API Endpoints

**Base URL:** `https://us-central1-hasod-41a23.cloudfunctions.net/api`

### Public Endpoints
- `GET /services` - Get all active services
- `GET /services/:serviceId` - Get specific service
- `POST /create-subscription` - Create PayPal subscription for service
- `POST /activate-subscription` - Activate subscription after PayPal approval
- `POST /paypal-webhook` - Receive PayPal webhook events

### Admin Endpoints (No auth currently - security issue)
- `POST /admin/services` - Create/update service
- `DELETE /admin/services/:serviceId` - Delete service
- `POST /admin/manual-payment` - Process manual payment
- `GET /admin/manual-transactions` - Get all transactions
- `POST /admin/cancel-subscription` - Cancel user subscription
- `POST /admin/manage-group` - Add/remove user from Google Group
- `POST /admin/seed-services` - Initialize service catalog (one-time)

---

## Common Tasks

### Adding a New Service
1. Use Developer page UI (create `src/pages/Developer.tsx` if not done)
2. Or call `POST /admin/services` with service data
3. Service will appear on Subscriptions page for users

### Processing Manual Payment
1. Admin opens ManualPaymentModal from Admin page
2. Fills: user email, service, amount, duration (months)
3. Backend creates transaction record + updates user's service status
4. User gets access for specified duration

### Handling PayPal Subscriptions
**Flow:**
1. User clicks "Subscribe with PayPal" → `POST /create-subscription`
2. Backend creates subscription with `custom_id = "uid:serviceId"`
3. User redirects to PayPal → approves → returns to app
4. App calls `POST /activate-subscription`
5. Backend verifies with PayPal → updates Firestore → adds to Google Group

**Webhook Processing:**
- PayPal sends event to `/paypal-webhook`
- Backend parses `custom_id` or looks up `subscriptionMappings`
- Updates user's `services.{serviceId}.status`
- Manages Google Group membership based on status

### Managing Google Groups
**Current Status:** Placeholder implementation (logs to console)

**To Enable:**
1. Follow `GOOGLE_GROUP_SETUP.md` (30 min setup)
2. Replace placeholder functions with real implementation
3. Code is ready in `functions/src/services/google-groups.service.ts`

---

## Code Style & Conventions

### TypeScript
- Strict mode enabled
- Explicit return types for functions
- Use interfaces for data models (in `src/types/` and `shared/`)
- Avoid `any`, use proper types

### React
- Functional components with hooks
- Keep components small and focused
- Extract reusable logic to custom hooks
- Props interface for each component

### Backend
- Service layer pattern (business logic in `functions/src/services/`)
- Express routes only handle HTTP concerns (in `index.ts`)
- Custom error classes for typed error handling
- Comprehensive error logging

### Naming
- Files: kebab-case (`service-card.tsx`, `subscription.service.ts`)
- Components: PascalCase (`ServiceCard`, `ManualPaymentModal`)
- Functions/variables: camelCase (`getUserSubscriptions`, `isActive`)
- Constants: UPPER_SNAKE_CASE (`PAYPAL_BASE_URL`, `ADMIN_EMAILS`)
- Service IDs: kebab-case (`music-library`, `hasod-downloader`)

---

## Known Issues & TODOs

### Security (CRITICAL)
- [ ] Add authentication to admin endpoints
- [ ] Implement PayPal webhook signature verification
- [ ] Configure proper CORS (currently allows `*`)
- [ ] Add rate limiting to prevent abuse

### Features (In Progress)
- [x] Multi-service subscription system (80% done)
- [x] PayPal integration with custom_id
- [x] Manual payment processing
- [ ] Admin page updates for manual payments (20% remaining)
- [ ] Developer page for service management (not started)
- [ ] Google Groups automatic management (requires setup)

### Technical Debt
- [ ] Add comprehensive test coverage
- [ ] Implement retry logic for PayPal API calls
- [ ] Add structured logging
- [ ] Set up monitoring and alerts
- [ ] Cache PayPal access tokens

---

## Important Configuration

### Admin Emails (Hardcoded)
```typescript
const ADMIN_EMAILS = ['hasod@hasodonline.com', 'yubarkan@gmail.com'];
```
Location: `src/App.tsx` and `firestore.rules`

### Environment Variables
**Frontend (.env):**
- Firebase config (API key, project ID, etc.)
- Functions URL for local development

**Backend (Firebase Functions config):**
```bash
firebase functions:config:set \
  paypal.client_id="..." \
  paypal.client_secret="..." \
  paypal.sandbox="true"  # false for production
  app.url="https://hasod-41a23.web.app"
```

### PayPal Plans
- Music Library: `P-4TS05390XU019010LNAY3XOI` ($10/month)
- Hasod Downloader: Not configured yet

### Google Groups
- Music Library: `hasod-online-member-v1@hasodonline.com`

---

## Debugging Tips

### Frontend Issues
- Check browser console for errors
- Verify Firebase auth state in React DevTools
- Check API calls in Network tab
- Ensure VITE_* environment variables are set

### Backend Issues
- View logs: `firebase functions:log --only api`
- Check Firestore data in Firebase Console
- Test endpoints with curl/Postman
- Verify Firebase Functions config: `firebase functions:config:get`

### PayPal Issues
- Check webhook delivery in PayPal Developer Dashboard
- Verify subscription status via PayPal API
- Check `webhookEvents` collection for event logs
- Ensure custom_id is being sent and received

---

## Documentation Maintenance

### When Adding Features
1. Update ARCHITECTURE.md with data model changes
2. Update API.md with new endpoints
3. Update this claude.md with new patterns/conventions
4. Add inline code comments for complex logic

### When Fixing Bugs
1. Document the issue and solution in commit message
2. If security-related, update known issues section
3. Consider adding to FAQ section in README.md

### When Changing Architecture
1. Update ARCHITECTURE.md immediately
2. Update affected code references in claude.md
3. Run migration scripts if database changes
4. Update setup instructions if config changes

---

## Quick Reference

### Useful Commands
```bash
# Development
npm run dev                              # Start frontend dev server
npm run functions:build                  # Build functions
npm run functions:serve                  # Run functions locally

# Deployment
firebase deploy --only hosting           # Deploy frontend only
firebase deploy --only functions         # Deploy backend only
firebase deploy --only firestore:rules   # Deploy security rules

# Data Management
npm run seed-services                    # Initialize services (one-time)
npm run migrate-data                     # Migrate users to multi-service

# Testing
npm test                                 # Run frontend tests
firebase emulators:start                 # Start Firebase emulators

# Logs & Debugging
firebase functions:log                   # View function logs
firebase functions:config:get            # View config
```

### Key Files to Check
- User flow: `src/App.tsx` → `src/pages/Subscriptions.tsx`
- API implementation: `functions/src/index.ts` + `functions/src/services/*`
- Data access: `functions/src/services/firestore.service.ts`
- Types: `shared/types.ts`, `src/types/*`

---

## Working with Claude Code

### When I Ask You to Make Changes

**Always:**
1. Read the relevant files first before making changes
2. Understand the current implementation
3. Check types and interfaces in `shared/` and `src/types/`
4. Maintain existing code style and patterns
5. Update TypeScript types if data structures change
6. Test locally before suggesting deployment

**Never:**
7. Hardcode credentials or API keys
8. Break existing functionality
9. Remove error handling
10. Skip TypeScript type definitions
11. Commit sensitive files (.env, service-account keys)

### When I Report a Bug
1. Ask for specific error messages and logs
2. Check Firebase Console for Firestore/Auth errors
3. Check browser console for frontend errors
4. Review recent code changes
5. Verify configuration is correct
6. Provide clear reproduction steps

### When I Request a Feature
1. Clarify requirements and edge cases
2. Plan data model changes first
3. Update backend before frontend
4. Create types before implementation
5. Update documentation
6. Suggest testing approach

---

## Project Status Summary

**Production Ready:**
- Backend API (all endpoints working)
- PayPal subscription creation & webhooks
- Firestore security rules
- Multi-service data model
- Frontend subscriptions page

**Needs Completion (2-3 hours):**
- Admin page manual payment UI
- Developer page for service management
- Polish and CSS improvements

**Requires Setup (30 min):**
- Google Groups automatic management

**Security Improvements Needed:**
- Admin endpoint authentication
- Webhook signature verification
- CORS configuration
- Rate limiting

---

This document should always be kept up-to-date as the project evolves. It's your single source of truth for understanding and working with this codebase efficiently.
