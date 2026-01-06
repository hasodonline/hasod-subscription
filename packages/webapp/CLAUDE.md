# Webapp Development - Hasod Subscription System

## TL;DR

**What:** React 18 + TypeScript frontend for subscription management
**Commands:**
- `npm run dev` - Start dev server (http://localhost:5000)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

**Key Files:**
- Entry: `src/main.tsx`
- Routes: `src/App.tsx`
- Auth: `src/contexts/AuthContext.tsx`
- API: `src/api/`
- **Generated Types:** `src/api/schema.d.ts` (from OpenAPI spec)

**Important:** API types are generated from OpenAPI spec. Run `npm run api:generate` after spec changes.

## Project Structure

```
packages/webapp/
├── src/
│   ├── main.tsx             # Entry point
│   ├── App.tsx              # Routes & layout
│   ├── pages/               # Page components
│   │   ├── Home.tsx
│   │   ├── Subscriptions.tsx
│   │   ├── Admin.tsx
│   │   ├── Download.tsx
│   │   └── ...
│   ├── components/          # Reusable components
│   │   ├── ServiceCard.tsx
│   │   ├── ManualPaymentModal.tsx
│   │   └── ...
│   ├── contexts/            # React contexts
│   │   └── AuthContext.tsx  # Firebase Auth state
│   ├── api/                 # API client layer
│   │   ├── schema.d.ts      # GENERATED - DO NOT EDIT (from OpenAPI)
│   │   ├── client.ts        # Axios instance
│   │   ├── services.api.ts  # Service endpoints
│   │   ├── subscriptions.api.ts
│   │   ├── transactions.api.ts
│   │   └── download.api.ts
│   ├── hooks/               # Custom hooks
│   │   └── useServices.ts
│   └── types/               # Legacy types (prefer generated schema)
├── public/                  # Static assets
├── index.html              # Entry HTML
├── vite.config.ts          # Vite config
└── package.json
```

## Quick Start

```bash
# Install dependencies (if not done)
npm install

# Run dev server
npm run dev

# Build for production
npm run build

# Preview build
npm run preview
```

## Authentication

**Method:** Firebase Google OAuth

**Key File:** `src/contexts/AuthContext.tsx`

**Usage:**
```typescript
import { useAuth } from './contexts/AuthContext';

function MyComponent() {
  const { user, loading, signIn, signOut } = useAuth();

  if (loading) return <div>Loading...</div>;
  if (!user) return <button onClick={signIn}>Sign In</button>;

  return <div>Welcome {user.email}</div>;
}
```

**Admin Check:**
```typescript
const ADMIN_EMAILS = [
  'hasod@hasodonline.com',
  'yubarkan@gmail.com'
];

const isAdmin = ADMIN_EMAILS.includes(user.email);
```

## API Integration (Spec-First)

**Types Source:** Generated from OpenAPI spec (`packages/api-spec/openapi.yaml`)
**Generated File:** `src/api/schema.d.ts` (DO NOT EDIT)

**Base URL:**
- Production: `https://us-central1-hasod-41a23.cloudfunctions.net/api`
- Development: Set in `packages/webapp/.env` as `VITE_FUNCTIONS_URL`

**API Client:** `src/api/client.ts`

**Using Generated Types:**
```typescript
import type { components } from './schema';
import apiClient from './client';

// Define types from generated schema
type Service = components['schemas']['Service'];
type ServicesResponse = components['schemas']['ServicesResponse'];

// Use typed API calls
export async function getServices(): Promise<Service[]> {
  const response = await apiClient.get<ServicesResponse>('/services');
  return response.data.services;
}
```

**API Modules (all use generated types):**
- `services.api.ts` - Service catalog operations
- `subscriptions.api.ts` - PayPal subscription operations
- `transactions.api.ts` - Manual payment transactions
- `download.api.ts` - Download service operations

**Regenerating Types:**
```bash
npm run api:generate  # From root directory
```

## Common Tasks

### Adding a New Page

1. Create component in `src/pages/`:
```typescript
// src/pages/NewPage.tsx
export function NewPage() {
  return <div>New Page</div>;
}
```

2. Add route in `src/App.tsx`:
```typescript
<Route path="/new-page" element={<NewPage />} />
```

3. Add navigation link:
```typescript
<Link to="/new-page">New Page</Link>
```

### Adding a New Component

```typescript
// src/components/MyComponent.tsx
import { FC } from 'react';

interface MyComponentProps {
  title: string;
  onAction: () => void;
}

export const MyComponent: FC<MyComponentProps> = ({ title, onAction }) => {
  return (
    <div>
      <h2>{title}</h2>
      <button onClick={onAction}>Click Me</button>
    </div>
  );
};
```

### Using Shared Types

```typescript
import { UserSubscription, ServiceConfig } from '@hasod/shared/types';

function MyComponent() {
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  // ...
}
```

### Calling Backend API

```typescript
import { apiClient } from '../api/client';

async function fetchUserData() {
  try {
    const response = await apiClient.get('/user/profile');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch user data:', error);
    throw error;
  }
}
```

## Environment Variables

**File:** `.env` (root of project)

**Example:**
```
VITE_FIREBASE_API_KEY=xxx
VITE_FIREBASE_AUTH_DOMAIN=hasod-41a23.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=hasod-41a23
# ... other Firebase config
```

**Usage:**
```typescript
const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
```

## Firebase Integration

**Config:** `src/firebase.ts`

```typescript
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  // ... config
});

export const auth = getAuth(app);
export const db = getFirestore(app);
```

## Routing

**Router:** React Router v7

**Protected Routes:**
```typescript
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/" />;

  return children;
}

// Usage
<Route path="/admin" element={
  <ProtectedRoute>
    <Admin />
  </ProtectedRoute>
} />
```

## Styling

**Method:** CSS Modules + inline styles

**Files:**
- `src/App.css` - Global styles
- `src/styles.css` - Component styles

**Theme:**
- Dark gradient backgrounds
- Blue accent color: `#3B8ED0`
- Modern, clean UI

## State Management

**Method:** React Context + Hooks

**Auth State:** `AuthContext.tsx`
**Local State:** `useState`, `useReducer`
**Server State:** API calls + `useState`

**Example:**
```typescript
const [services, setServices] = useState<ServiceConfig[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  async function load() {
    const data = await fetchServices();
    setServices(data);
    setLoading(false);
  }
  load();
}, []);
```

## Building & Deployment

### Development Build
```bash
npm run dev
```
Output: Dev server at http://localhost:5000

### Production Build
```bash
npm run build
```
Output: `dist/` folder

### Deploy to Firebase
```bash
# From root
npm run deploy

# Or hosting only
firebase deploy --only hosting
```

## Testing

```bash
# Run in dev mode
npm run dev

# Test features manually:
# 1. Sign in with Google
# 2. Navigate to Subscriptions
# 3. Test subscription flow
# 4. Check admin page (if admin)
# 5. Test downloads
```

## Troubleshooting

### "Module not found @hasod/shared"
```bash
cd ../shared
npm run build
cd ../webapp
```

### "Firebase auth error"
- Check `.env` file has correct Firebase config
- Verify Google OAuth is enabled in Firebase Console
- Clear browser cache

### "API calls fail"
- Check functions are running: `npm run functions:serve`
- Verify API base URL in `src/api/client.ts`
- Check network tab in browser DevTools

### "Build fails"
```bash
# Clean and rebuild
rm -rf dist node_modules
npm install
npm run build
```

## Code Style

### TypeScript
- Use strict mode
- Define interfaces for props
- Avoid `any` type
- Use explicit return types

### React
- Functional components only
- Use hooks
- Props interface above component
- Export as named export

**Example:**
```typescript
interface MyComponentProps {
  title: string;
  count: number;
}

export function MyComponent({ title, count }: MyComponentProps) {
  const [value, setValue] = useState(0);

  return <div>{title}: {count + value}</div>;
}
```

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/main.tsx` | Entry point, renders App |
| `src/App.tsx` | Routes, layout, admin check |
| `src/firebase.ts` | Firebase initialization |
| `src/contexts/AuthContext.tsx` | Auth state management |
| `src/api/client.ts` | Axios instance, base URL |
| `src/pages/Subscriptions.tsx` | Main subscription page |
| `src/pages/Admin.tsx` | Admin dashboard |
| `src/pages/Download.tsx` | Download service UI |

## Related Documentation

- [Main CLAUDE.md](../../CLAUDE.md) - Project overview
- [Functions CLAUDE.md](../functions/CLAUDE.md) - Backend API
- [Shared CLAUDE.md](../shared/CLAUDE.md) - Shared types
- [ARCHITECTURE.md](../../docs/ARCHITECTURE.md) - System design

---

**Package:** @hasod/webapp
**Framework:** React 18 + Vite
**Language:** TypeScript
