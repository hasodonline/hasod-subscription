# Hasod Subscription Management System

## Quick Context

**Project Type:** Monorepo - Subscription management platform with web, desktop, and backend
**Tech Stack:** React + TypeScript, Firebase Functions, Tauri (Rust), Firebase hosting
**API Approach:** Spec-first with OpenAPI 3.1

**Main Commands:**
```bash
npm run dev              # Run webapp dev server
npm run functions:serve  # Run backend emulator
npm run api:generate     # Generate types from OpenAPI spec
npm run build            # Build all packages
npm run deploy           # Deploy everything to Firebase
```

## Project Structure

```
hasod-subscription/
├── packages/
│   ├── api-spec/            # OpenAPI 3.1 specification (SINGLE SOURCE OF TRUTH)
│   ├── webapp/              # React web app
│   ├── functions/           # Firebase Cloud Functions
│   ├── shared/              # Shared types/utils (legacy, prefer OpenAPI)
│   └── desktop/             # Tauri desktop app (Rust + React)
├── docs/                    # Documentation
├── scripts/                 # Build & deployment scripts
└── CLAUDE.md               # This file
```

## Key Principles

### 1. Spec-First API Development
⚠️ **CRITICAL**: All API changes MUST follow this workflow:

```bash
# 1. Update OpenAPI spec first
packages/api-spec/openapi.yaml

# 2. Validate and generate types
npm run api:validate
npm run api:generate

# 3. Implement backend
packages/functions/src/index.ts

# 4. Use generated types in frontend
import type { components } from './schema';
```

### 2. Package Ownership
- **api-spec + webapp + functions**: Web development (spec-first)
- **shared**: Maintained ONLY by webapp/functions developers (legacy)
- **desktop**: Desktop app development (Tauri/Rust)

### 3. Generated Types
- **Source:** `packages/api-spec/openapi.yaml`
- **Output:** `packages/webapp/src/api/schema.d.ts`
- All API types come from OpenAPI spec

## Quick Start

### For API Development (Spec-First)
See: [packages/api-spec/CLAUDE.md](packages/api-spec/CLAUDE.md)
```bash
# Edit spec
code packages/api-spec/openapi.yaml

# Validate and generate types
npm run api:validate
npm run api:generate
```

### For Web Development
See: [packages/webapp/CLAUDE.md](packages/webapp/CLAUDE.md)
```bash
npm run dev                    # Start webapp
npm run functions:serve        # Start functions emulator
```

### For Backend API Development
See: [packages/functions/CLAUDE.md](packages/functions/CLAUDE.md)
```bash
npm run build:functions        # Build TypeScript
npm run functions:serve        # Run emulator
```

### For Desktop App Development
See: [packages/desktop/CLAUDE.md](packages/desktop/CLAUDE.md)
```bash
cd packages/desktop
npm run dev                    # Run in development mode
npm run build                  # Build production app
```

## Architecture Overview

### API Specification (packages/api-spec/)
- **OpenAPI 3.1** - Single source of truth for API contracts
- **18 endpoints** documented
- Generates TypeScript types for webapp
- Desktop references spec for types

### Web Application (packages/webapp/)
- React 18 + TypeScript + Vite
- **API types from OpenAPI** (`src/api/schema.d.ts`)
- Firebase Auth (Google OAuth)
- Firestore for data
- React Router for routing

### Backend API (packages/functions/)
- Firebase Cloud Functions v2 (Node.js 20)
- Express.js REST API
- PayPal subscription integration
- Google Workspace integration
- Download service (YouTube, Spotify)

### Desktop App (packages/desktop/)
- **Tauri 2** (Rust + React)
- License validation via Cloud Functions API
- Downloads: YouTube, Spotify, SoundCloud
- Requires active `hasod-downloader` subscription

### Shared Package (packages/shared/)
- TypeScript types (backward compatibility)
- Constants (API URLs, admin emails)
- Common utilities
- **Note:** Prefer OpenAPI-generated types for new code

## API Endpoints (18 total)

Defined in `packages/api-spec/openapi.yaml`:

| Group | Endpoints |
|-------|-----------|
| Services | GET /services, GET /services/:serviceId |
| Subscriptions | POST /create-subscription, POST /activate-subscription, POST /paypal-webhook |
| User | GET /user/subscription-status |
| Admin | POST /admin/services, DELETE /admin/services/:serviceId, POST /admin/manual-payment, GET /admin/manual-transactions, GET /admin/manual-transactions/:userId, POST /admin/cancel-subscription, POST /admin/manage-group, POST /admin/migrate-users, POST /admin/seed-services |
| Downloads | POST /download/submit, GET /download/status/:jobId, GET /download/history, DELETE /download/:jobId |

## End-to-End Development Workflow

### Adding a New API Endpoint

```bash
# 1. Define in OpenAPI spec
# Edit packages/api-spec/openapi.yaml

# 2. Validate spec
npm run api:validate

# 3. Generate TypeScript types
npm run api:generate

# 4. Implement backend endpoint
# Edit packages/functions/src/index.ts

# 5. Create frontend API client
# Edit packages/webapp/src/api/yourFeature.api.ts

# 6. Build and test
npm run build:functions
npm run functions:serve
npm run build:webapp
npm run dev

# 7. Deploy
npm run deploy
```

### Modifying Existing Endpoint

```bash
# 1. Update spec first
# Edit packages/api-spec/openapi.yaml

# 2. Regenerate types
npm run api:generate

# 3. TypeScript will show compile errors for breaking changes

# 4. Fix implementation in functions and webapp

# 5. Build and deploy
npm run build
npm run deploy
```

## Deployment

### Pre-Deployment Checklist
```bash
npm run api:validate    # Validate OpenAPI spec
npm run build           # Build all packages (shared → webapp → functions)
```

### Deploy Commands
```bash
# Deploy everything
npm run deploy

# Or deploy individually
firebase deploy --only hosting      # Webapp only
firebase deploy --only functions    # Functions only
firebase deploy --only firestore:rules
```

### Verify Deployment
```bash
curl https://us-central1-hasod-41a23.cloudfunctions.net/api/services
```

## Environment Setup

### Required Files
- `packages/webapp/.env` - Webapp environment variables
- `packages/functions/.env.yaml` - Functions secrets
- `firebase.json` - Firebase configuration
- `firestore.rules` - Security rules

### Admin Access
Hardcoded in multiple places:
- `packages/webapp/src/App.tsx`
- `packages/shared/src/constants/index.ts`
- `firestore.rules`

Current admins:
- `hasod@hasodonline.com`
- `yubarkan@gmail.com`

## Important URLs

- **Production Webapp**: https://hasod-41a23.web.app
- **API Base**: https://us-central1-hasod-41a23.cloudfunctions.net/api
- **Firebase Console**: https://console.firebase.google.com/project/hasod-41a23
- **API Documentation**: Run `npm run api:docs` locally

## Package-Specific Instructions

Each package has its own CLAUDE.md:

- **[packages/api-spec/CLAUDE.md](packages/api-spec/CLAUDE.md)** - OpenAPI specification
- **[packages/webapp/CLAUDE.md](packages/webapp/CLAUDE.md)** - React webapp development
- **[packages/functions/CLAUDE.md](packages/functions/CLAUDE.md)** - Backend API development
- **[packages/shared/CLAUDE.md](packages/shared/CLAUDE.md)** - Shared code (legacy)
- **[packages/desktop/CLAUDE.md](packages/desktop/CLAUDE.md)** - Desktop app development

## Rules & Conventions

### DO:
- ✅ **Update OpenAPI spec before implementing API changes**
- ✅ Run `npm run api:generate` after spec changes
- ✅ Use generated types from `schema.d.ts`
- ✅ Test locally before deploying
- ✅ Follow TypeScript strict mode

### DON'T:
- ❌ Implement API without updating spec first
- ❌ Manually define API types (use generated types)
- ❌ Deploy without validating spec
- ❌ Commit sensitive files (`.env`, `service-account-key.json`)
- ❌ Skip testing in emulator

## Troubleshooting

### "Type doesn't match API response"
```bash
npm run api:generate  # Regenerate types from spec
```

### "Module not found @hasod/shared"
```bash
cd packages/shared && npm run build
```

### "Firebase deploy failed"
```bash
firebase login
firebase use hasod-41a23
firebase functions:log
```

### "API calls fail in production"
- Check `packages/webapp/.env` has `VITE_FUNCTIONS_URL`
- Rebuild and redeploy: `npm run build:webapp && firebase deploy --only hosting`

## Support

- **Issues**: GitHub Issues
- **Email**: hasod@hasodonline.com
- **Docs**: [docs/](docs/)

---

**Last Updated**: January 2026
**API Spec Version**: OpenAPI 3.1
**Project Status**: Production (webapp/functions), Beta (desktop)
