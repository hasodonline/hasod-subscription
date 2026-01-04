# Shared Package - Hasod Subscription System

## TL;DR

**What:** Common TypeScript types, utilities, and constants shared across all packages
**Commands:**
- `npm run build` - Build package (required before using in other packages)
- `npm run watch` - Watch mode for development

**CRITICAL:** Only webapp/functions developers can modify this package. Desktop app reads only.

**Import Patterns:**
- Webapp: `import { Type } from '@hasod/shared/types'`
- Functions: `import { Type } from '../../../shared/src/types'`
- Desktop: Equivalent Python types (reads for reference)

## Purpose

Centralize common code to:
- Avoid duplication across packages
- Ensure type consistency between frontend and backend
- Single source of truth for interfaces
- Share constants (API URLs, admin emails, etc.)

## Project Structure

```
packages/shared/
├── src/
│   ├── index.ts          # Main exports
│   ├── types/            # TypeScript type definitions
│   │   └── index.ts
│   ├── utils/            # Utility functions
│   │   └── index.ts
│   ├── constants/        # Shared constants
│   │   └── index.ts
│   └── api/              # API client helpers
│       └── index.ts
├── dist/                 # Compiled JavaScript (gitignored)
├── tsconfig.json
└── package.json
```

## Package Exports

```typescript
// Main export
export * from './types';
export * from './utils';
export * from './constants';
export * from './api';
```

## Types (`src/types/index.ts`)

### User Types

```typescript
export interface User {
  email: string;
  displayName: string;
  photoURL?: string;
  services?: Record<string, UserSubscription>;
}

export interface UserSubscription {
  serviceId: string;
  status: 'active' | 'expired' | 'cancelled';
  paymentMethod: 'paypal' | 'manual';
  paypalSubscriptionId?: string;
  startDate: string;
  nextBillingDate?: string;
  manualEndDate?: string;
}

export type SubscriptionStatus = 'active' | 'expired' | 'cancelled';
export type PaymentMethod = 'paypal' | 'manual';
```

### Service Types

```typescript
export interface ServiceConfig {
  id: string;
  name: string;
  nameHe: string;
  description?: string;
  descriptionHe?: string;
  paypalPlanId: string;
  pricePerMonth: number;
  currency: string;
  active: boolean;
  googleGroupEmail?: string;
  features: string[];
  featuresHe: string[];
  order?: number;
}
```

### Transaction Types

```typescript
export interface Transaction {
  id: string;
  userId: string;
  serviceId: string;
  amount: number;
  currency: string;
  type: 'paypal_subscription' | 'manual_payment' | 'refund';
  status: 'completed' | 'pending' | 'failed';
  timestamp: string;
  receiptUrl?: string;
  notes?: string;
}
```

### Download Types

```typescript
export interface DownloadJob {
  id: string;
  url: string;
  format: 'mp3' | 'mp4';
  status: 'pending' | 'downloading' | 'converting' | 'complete' | 'error';
  progress: number;
  fileName?: string;
  downloadUrl?: string;
  error?: string;
  createdAt: string;
}
```

## Constants (`src/constants/index.ts`)

```typescript
// API URLs
export const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://us-central1-hasod-41a23.cloudfunctions.net/api'
  : 'http://localhost:5001/hasod-41a23/us-central1/api';

// Admin emails
export const ADMIN_EMAILS = [
  'hasod@hasodonline.com',
  'yubarkan@gmail.com'
];

// Subscription durations
export const SUBSCRIPTION_DURATIONS = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12
} as const;

// Payment methods
export const PAYMENT_METHODS = {
  PAYPAL: 'paypal',
  MANUAL: 'manual'
} as const;

// Service IDs
export const SERVICE_IDS = {
  MUSIC_LIBRARY: 'music-library',
  HASOD_DOWNLOADER: 'hasod-downloader'
} as const;
```

## Utilities (`src/utils/index.ts`)

```typescript
/**
 * Format date for display
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Check if date is expired
 */
export function isExpired(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.getTime() < Date.now();
}

/**
 * Add months to date
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Format currency
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(amount);
}

/**
 * Validate email
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
```

## API Helpers (`src/api/index.ts`)

```typescript
// Placeholder for API client helpers
// Add common API request/response utilities here

export interface ApiResponse<T> {
  data: T;
  error?: string;
}

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
}
```

## Usage Examples

### In Webapp

```typescript
import { UserSubscription, ServiceConfig } from '@hasod/shared/types';
import { formatDate, isExpired } from '@hasod/shared/utils';
import { ADMIN_EMAILS, API_BASE_URL } from '@hasod/shared/constants';

function MyComponent() {
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);

  const isAdmin = ADMIN_EMAILS.includes(user.email);
  const expiryDate = subscription?.nextBillingDate;
  const formatted = expiryDate ? formatDate(expiryDate) : 'N/A';

  return <div>{formatted}</div>;
}
```

### In Functions

```typescript
import { UserSubscription, Transaction } from '../../../shared/src/types';
import { addMonths, isExpired } from '../../../shared/src/utils';
import { ADMIN_EMAILS } from '../../../shared/src/constants';

async function processSubscription(email: string, subscription: UserSubscription) {
  if (ADMIN_EMAILS.includes(email)) {
    // Admin logic
  }

  if (subscription.manualEndDate && isExpired(subscription.manualEndDate)) {
    // Handle expiration
  }
}
```

### In Desktop (Python Equivalent)

Desktop app uses Python dict/dataclass equivalents:

```python
# Equivalent to UserSubscription TypeScript type
from dataclasses import dataclass
from typing import Optional

@dataclass
class UserSubscription:
    service_id: str
    status: str  # 'active' | 'expired' | 'cancelled'
    payment_method: str  # 'paypal' | 'manual'
    start_date: str
    next_billing_date: Optional[str] = None

# Desktop reads API response and maps to Python types
```

## Development Workflow

### Building

```bash
# Build once
npm run build

# Watch mode (during development)
npm run watch
```

**Output:** `dist/` folder with compiled JavaScript

### Using in Other Packages

**After modifying shared package:**

```bash
# 1. Build shared
cd packages/shared
npm run build

# 2. Use in webapp
cd ../webapp
# Import works automatically via @hasod/shared

# 3. Use in functions
cd ../functions
# Import via relative path
```

## Adding New Types

1. Edit `src/types/index.ts`:
```typescript
export interface NewType {
  id: string;
  name: string;
  // ...
}
```

2. Build package:
```bash
npm run build
```

3. Use in webapp/functions:
```typescript
import { NewType } from '@hasod/shared/types';
```

## Adding New Constants

1. Edit `src/constants/index.ts`:
```typescript
export const NEW_CONSTANT = 'value';
```

2. Build and import as above

## Adding New Utilities

1. Edit `src/utils/index.ts`:
```typescript
export function newUtility(arg: string): string {
  return arg.toUpperCase();
}
```

2. Build and import

## Package Rules

### WHO Can Modify

✅ **Webapp developers** - When adding frontend types
✅ **Functions developers** - When adding backend types
❌ **Desktop developers** - Read-only (request changes via webapp/functions devs)

### WHAT to Put Here

✅ Types used in both frontend and backend
✅ Constants shared across apps
✅ Pure utility functions (no framework deps)
❌ React components (webapp only)
❌ Express middleware (functions only)
❌ Framework-specific code

### WHEN to Add

- Type is used in 2+ packages
- Constant is referenced in multiple places
- Utility is framework-agnostic
- Want to ensure consistency

## Best Practices

### Keep It Minimal
- Only add truly shared code
- Don't add "might be useful" code
- Remove unused exports

### No Dependencies
- Avoid external dependencies
- Keep package lightweight
- Use built-in TypeScript/JavaScript only

### Pure Functions
- Utilities should be pure when possible
- No side effects
- Predictable output

### Document Exports
- Add JSDoc comments
- Explain purpose and usage
- Include examples

### Type Safety
- Use strict TypeScript
- Avoid `any` type
- Export interfaces, not classes

## Testing

```typescript
// In src/utils/index.test.ts (if testing added)
import { formatDate, isExpired } from './utils';

describe('formatDate', () => {
  it('formats date correctly', () => {
    const date = new Date('2025-01-01');
    expect(formatDate(date)).toBe('January 1, 2025');
  });
});
```

## Troubleshooting

### "Cannot find module '@hasod/shared'"

```bash
cd packages/shared
npm run build
```

### "Type errors after modifying shared"

1. Rebuild shared: `npm run build`
2. Restart TypeScript server in VSCode
3. Clear cache if needed

### "Desktop app can't use shared types"

Desktop uses Python - create equivalent types manually:
- TypeScript interface → Python dataclass
- Consult shared/src/types/ for reference

## Version Management

Since this is a monorepo with workspaces, shared package version is managed by root `package.json`.

**No need to publish** - used internally only.

## Migration Notes

Types previously in:
- `packages/webapp/src/types/` → Move here if used in functions
- `packages/functions/src/` → Move here if used in webapp

**Gradual migration** - Move types as needed, don't rush.

## Related Documentation

- [Root CLAUDE.md](../../CLAUDE.md) - Project overview
- [Webapp CLAUDE.md](../webapp/CLAUDE.md) - Frontend usage
- [Functions CLAUDE.md](../functions/CLAUDE.md) - Backend usage
- [Desktop CLAUDE.md](../desktop/CLAUDE.md) - Python equivalents

---

**Package:** @hasod/shared
**Language:** TypeScript
**Purpose:** Shared types, utils, constants
**Maintainers:** Webapp & Functions developers only
