---
name: webapp-backend
description: Develop React webapp (packages/webapp/), Firebase Cloud Functions backend (packages/functions/), and maintain shared package (packages/shared/). Use for frontend UI, backend API, PayPal integration, download service, and Firebase deployment. ONLY this skill can modify packages/shared/. API changes MUST follow spec-first OpenAPI workflow.
---

# Webapp & Backend Development Skill

## When to Use This Skill

Activate this skill for:
- React webapp development (UI, pages, components)
- Cloud Functions backend API (Express routes, services)
- **API changes (spec-first with OpenAPI)**
- Shared package maintenance (types, utils, constants) - **EXCLUSIVE RESPONSIBILITY**
- PayPal subscription integration
- Download service (YouTube, Spotify)
- Firebase deployment (hosting, functions)

**Do NOT use for:**
- Desktop application (`packages/desktop/`)
- Documentation-only changes
- Build tooling

## Spec-First API Development (IMPORTANT)

**ALL API changes MUST follow this workflow:**

### 1. Update OpenAPI Spec First
```bash
# Edit the spec
packages/api-spec/openapi.yaml
```

### 2. Validate & Generate Types
```bash
npm run api:validate    # Check spec is valid
npm run api:generate    # Generate TypeScript types
```

### 3. Implement Backend
```bash
# Add/update endpoint in
packages/functions/src/index.ts
```

### 4. Update Frontend (types are already generated)
```bash
# Import from generated schema
import type { components } from './schema';
type MyType = components['schemas']['MyType'];
```

### 5. Build & Deploy
```bash
npm run build           # Build all packages
npm run deploy          # Deploy to Firebase
```

## Quick Commands

```bash
# API Development (Spec-First)
npm run api:validate           # Validate OpenAPI spec
npm run api:generate           # Generate TypeScript types
npm run api:docs               # Preview API documentation

# Development
npm run dev                    # Start webapp (localhost:5000)
npm run functions:serve        # Start functions emulator

# Building
npm run build:shared           # Build shared package
npm run build:webapp           # Build webapp
npm run build:functions        # Build functions
npm run build                  # Build all (shared → webapp → functions)

# Deployment
npm run deploy                 # Deploy all to Firebase
firebase deploy --only hosting # Webapp only
firebase deploy --only functions # Functions only
```

## Architecture

### API Spec (packages/api-spec/) - SINGLE SOURCE OF TRUTH
- **OpenAPI 3.1** specification
- **Spec file:** `openapi.yaml` (18 endpoints documented)
- **Generated types:** `packages/webapp/src/api/schema.d.ts`
- All API contracts defined here first

### Webapp (packages/webapp/)
- **Framework:** React 18 + TypeScript + Vite
- **API Types:** Generated from OpenAPI (`src/api/schema.d.ts`)
- **API Client:** Axios with typed responses
- **Auth:** Firebase Authentication (Google OAuth)
- **Data:** Firestore
- **Routing:** React Router v7

### Functions (packages/functions/)
- **Runtime:** Node.js 20, Firebase Functions v2
- **Framework:** Express.js
- **Entry:** `src/index.ts`
- **Services:** `src/services/` (PayPal, subscriptions, downloads)
- **Types:** Reference OpenAPI spec for request/response shapes

### Shared (packages/shared/)
- **Types:** `src/types/index.ts` (backward compatibility, prefer OpenAPI)
- **Constants:** `src/constants/index.ts`
- **Utils:** `src/utils/index.ts`
- **CRITICAL:** Only this skill modifies this package

## Key Workflows

### Adding New API Endpoint (Spec-First)

**Step 1: Define in OpenAPI spec**
```yaml
# packages/api-spec/openapi.yaml
paths:
  /new-endpoint:
    post:
      operationId: createNewThing
      summary: Create a new thing
      tags: [NewFeature]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateNewThingRequest'
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CreateNewThingResponse'

components:
  schemas:
    CreateNewThingRequest:
      type: object
      required: [name]
      properties:
        name:
          type: string
    CreateNewThingResponse:
      type: object
      required: [id, name]
      properties:
        id:
          type: string
        name:
          type: string
```

**Step 2: Validate and generate types**
```bash
npm run api:validate
npm run api:generate
```

**Step 3: Implement backend**
```typescript
// packages/functions/src/index.ts
app.post('/new-endpoint', async (req, res) => {
  const { name } = req.body;
  const result = await SomeService.createThing(name);
  res.json({ id: result.id, name: result.name });
});
```

**Step 4: Create frontend API client**
```typescript
// packages/webapp/src/api/newFeature.api.ts
import apiClient from './client';
import type { components } from './schema';

export type CreateNewThingRequest = components['schemas']['CreateNewThingRequest'];
export type CreateNewThingResponse = components['schemas']['CreateNewThingResponse'];

export async function createNewThing(
  params: CreateNewThingRequest
): Promise<CreateNewThingResponse> {
  const response = await apiClient.post<CreateNewThingResponse>('/new-endpoint', params);
  return response.data;
}
```

**Step 5: Build and test**
```bash
npm run build:functions
npm run functions:serve  # Test locally
npm run build:webapp
npm run dev              # Test frontend
```

### Modifying Existing Endpoint

1. Update OpenAPI spec first (`packages/api-spec/openapi.yaml`)
2. Run `npm run api:generate` to update types
3. TypeScript will show compile errors for breaking changes
4. Update functions implementation
5. Update webapp API client if needed
6. Build and deploy

### Adding Webapp Page

1. Create `packages/webapp/src/pages/NewPage.tsx`
2. Add route in `src/App.tsx`:
```typescript
<Route path="/new-page" element={<NewPage />} />
```
3. Test: `npm run dev`

## Generated Types Usage

```typescript
// Import types from generated schema
import type { components, operations } from './schema';

// Schema types
type Service = components['schemas']['Service'];
type DownloadJob = components['schemas']['DownloadJob'];

// Request/Response types
type CreateSubscriptionRequest = components['schemas']['CreateSubscriptionRequest'];
type CreateSubscriptionResponse = components['schemas']['CreateSubscriptionResponse'];

// Re-export for convenience
export type { Service, DownloadJob };
```

## Environment Variables

- **Webapp:** `packages/webapp/.env` (Vite format)
- **Functions:** `packages/functions/.env.yaml`

## Admin Emails

Hardcoded in multiple locations (keep in sync):
- `packages/webapp/src/App.tsx`
- `packages/shared/src/constants/index.ts`
- `firestore.rules`

Current: `hasod@hasodonline.com`, `yubarkan@gmail.com`

## Firebase Services

- **Auth:** Google OAuth
- **Firestore:** users, services, transactions, webhookEvents, downloadJobs
- **Functions:** Express API
- **Hosting:** Static site
- **Storage:** File uploads

## API Endpoints (18 total)

Defined in `packages/api-spec/openapi.yaml`:

| Group | Endpoints |
|-------|-----------|
| Services | GET /services, GET /services/:serviceId |
| Subscriptions | POST /create-subscription, POST /activate-subscription, POST /paypal-webhook |
| User | GET /user/subscription-status |
| Admin | POST /admin/services, DELETE /admin/services/:serviceId, POST /admin/manual-payment, GET /admin/manual-transactions, GET /admin/manual-transactions/:userId, POST /admin/cancel-subscription, POST /admin/manage-group, POST /admin/migrate-users, POST /admin/seed-services |
| Downloads | POST /download/submit, GET /download/status/:jobId, GET /download/history, DELETE /download/:jobId |

## End-to-End Development & Deployment

### Development Workflow
```bash
# 1. Start development servers
npm run dev                    # Webapp on localhost:5000
npm run functions:serve        # Functions emulator

# 2. Make changes following spec-first approach
# 3. Test locally

# 4. Build all
npm run build
```

### Deployment Workflow
```bash
# Pre-deployment checks
npm run api:validate           # Validate API spec
npm run build                  # Build all packages

# Deploy everything
npm run deploy

# Or deploy individually
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules

# Verify deployment
curl https://us-central1-hasod-41a23.cloudfunctions.net/api/services
```

### Production URLs
- **Webapp:** https://hasod-41a23.web.app
- **API:** https://us-central1-hasod-41a23.cloudfunctions.net/api
- **Console:** https://console.firebase.google.com/project/hasod-41a23

## Code Style

### TypeScript
- Strict mode enabled
- Explicit return types
- No `any` type
- Use generated types from OpenAPI

### React
- Functional components only
- TypeScript props interfaces
- Named exports

### Functions
- Thin route handlers
- Logic in services
- Async/await
- Proper error handling

## Common Issues

### "Type doesn't match API response"
```bash
# Regenerate types from spec
npm run api:generate
```

### "Module not found @hasod/shared"
```bash
cd packages/shared && npm run build
```

### "Firebase deploy failed"
```bash
firebase login
firebase use hasod-41a23
firebase functions:log  # Check logs
```

### "API calls fail"
- Check functions running: `npm run functions:serve`
- Check `packages/webapp/.env` has `VITE_FUNCTIONS_URL`
- Check browser network tab

## Related Documentation

- [Root CLAUDE.md](../../../CLAUDE.md) - Project overview
- [API Spec CLAUDE.md](../../api-spec/CLAUDE.md) - OpenAPI documentation
- [Webapp CLAUDE.md](../../webapp/CLAUDE.md) - Frontend details
- [Functions CLAUDE.md](../../functions/CLAUDE.md) - Backend details
- [Shared CLAUDE.md](../../shared/CLAUDE.md) - Shared package

## Responsibilities

**This skill handles:**
- ✅ React webapp (packages/webapp/)
- ✅ Cloud Functions (packages/functions/)
- ✅ OpenAPI spec (packages/api-spec/)
- ✅ Shared package (packages/shared/) - EXCLUSIVE
- ✅ Firebase deployment
- ✅ PayPal integration
- ✅ Download service

**NOT handled:**
- ❌ Desktop app (packages/desktop/)
- ❌ Build scripts
- ❌ Documentation-only changes
