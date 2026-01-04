---
name: webapp-backend
description: Develop React webapp (packages/webapp/), Firebase Cloud Functions backend (packages/functions/), and maintain shared package (packages/shared/). Use for frontend UI, backend API, PayPal integration, download service, and Firebase deployment. ONLY this skill can modify packages/shared/.
---

# Webapp & Backend Development Skill

## When to Use This Skill

Activate this skill for:
- React webapp development (UI, pages, components)
- Cloud Functions backend API (Express routes, services)
- Shared package maintenance (types, utils, constants) - **EXCLUSIVE RESPONSIBILITY**
- PayPal subscription integration
- Download service (YouTube, Spotify)
- Firebase deployment (hosting, functions)

**Do NOT use for:**
- Desktop application (`packages/desktop/`)
- Documentation-only changes
- Build tooling

## Quick Commands

```bash
# Development
npm run dev                    # Start webapp (localhost:5000)
npm run functions:serve        # Start functions emulator

# Building
npm run build:shared           # ALWAYS build shared first if modified
npm run build:webapp           # Build webapp
npm run build:functions        # Build functions

# Deployment
npm run deploy                 # Deploy all to Firebase
firebase deploy --only hosting # Webapp only
firebase deploy --only functions # Functions only
```

## Architecture

### Webapp (packages/webapp/)
- **Framework:** React 18 + TypeScript + Vite
- **Auth:** Firebase Authentication (Google OAuth)
- **Data:** Firestore
- **Routing:** React Router v7
- **Entry:** `src/main.tsx`
- **Routes:** `src/App.tsx`

### Functions (packages/functions/)
- **Runtime:** Node.js 20, Firebase Functions v2
- **Framework:** Express.js
- **Entry:** `src/index.ts`
- **Services:** `src/services/` (PayPal, subscriptions, downloads, etc.)

### Shared (packages/shared/)
- **Types:** `src/types/index.ts`
- **Constants:** `src/constants/index.ts`
- **Utils:** `src/utils/index.ts`
- **CRITICAL:** Only this skill modifies this package

## Key Workflows

### Adding API Endpoint

1. Add route in `packages/functions/src/index.ts`:
```typescript
app.get('/new-endpoint', async (req, res) => {
  // implementation
});
```

2. Build functions: `npm run build:functions`
3. Test locally: `npm run functions:serve`
4. Create client in webapp: `packages/webapp/src/api/`

### Adding Shared Type

1. Edit `packages/shared/src/types/index.ts`:
```typescript
export interface NewType {
  id: string;
  // ...
}
```

2. Build shared: `npm run build:shared`
3. Use in webapp: `import { NewType } from '@hasod/shared/types'`
4. Use in functions: `import { NewType } from '../../../shared/src/types'`

### Adding Webapp Page

1. Create `packages/webapp/src/pages/NewPage.tsx`
2. Add route in `src/App.tsx`:
```typescript
<Route path="/new-page" element={<NewPage />} />
```
3. Test: `npm run dev`

## Environment Variables

- **Webapp:** `.env` in root (Vite format)
- **Functions:** `packages/functions/.env.yaml`

## Admin Emails

Hardcoded in multiple locations (keep in sync):
- `packages/webapp/src/App.tsx`
- `packages/shared/src/constants/index.ts`
- `firestore.rules`

Current: `hasod@hasodonline.com`, `yubarkan@gmail.com`

## Firebase Services

- **Auth:** Google OAuth
- **Firestore:** users, services, transactions, webhookEvents
- **Functions:** Express API
- **Hosting:** Static site
- **Storage:** File uploads

## Important APIs

### PayPal Integration
- Service: `packages/functions/src/services/paypal.service.ts`
- Webhooks: `/webhooks/paypal` endpoint
- Plans: Configured in Firestore `services` collection

### Download Service
- YouTube: `src/services/youtube.downloader.ts` (yt-dlp)
- Spotify: `src/services/spotify.downloader.ts` (spotdl)
- Proxies: Configured via environment variables

## Code Style

### TypeScript
- Strict mode enabled
- Explicit return types
- No `any` type
- Interfaces for object shapes

### React
- Functional components only
- TypeScript props interfaces
- Named exports

### Functions
- Thin route handlers
- Logic in services
- Async/await
- Proper error handling

## Testing

```bash
# Webapp
npm run dev  # Manual testing in browser

# Functions
npm run functions:serve
curl http://localhost:5001/hasod-41a23/us-central1/api/services
```

## Deployment

```bash
# Pre-deployment
npm run build  # Build all packages

# Deploy
npm run deploy  # Everything

# Or separately
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules
```

## Common Issues

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
- Verify API URL in `packages/webapp/src/api/client.ts`
- Check browser network tab

## Related Documentation

- [Root CLAUDE.md](../../../CLAUDE.md) - Project overview
- [Webapp CLAUDE.md](../../webapp/CLAUDE.md) - Frontend details
- [Functions CLAUDE.md](../../functions/CLAUDE.md) - Backend details
- [Shared CLAUDE.md](../../shared/CLAUDE.md) - Shared package
- [Architecture](../../../docs/ARCHITECTURE.md) - System design
- [API Docs](../../../docs/API.md) - API reference

## Responsibilities

**This skill handles:**
- ✅ React webapp (packages/webapp/)
- ✅ Cloud Functions (packages/functions/)
- ✅ Shared package (packages/shared/) - EXCLUSIVE
- ✅ Firebase deployment
- ✅ PayPal integration
- ✅ Download service

**NOT handled:**
- ❌ Desktop app (packages/desktop/)
- ❌ Build scripts
- ❌ Documentation-only changes
