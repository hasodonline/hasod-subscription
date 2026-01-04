# @hasod/shared

Shared code, types, and utilities used across all Hasod applications (webapp, desktop, and functions).

## Purpose

This package centralizes common code to:
- **Avoid Duplication**: Single source of truth for types and utilities
- **Type Safety**: Shared TypeScript interfaces across frontend and backend
- **Consistency**: Same API client and constants everywhere
- **Maintainability**: Update once, use everywhere

## Structure

```
shared/
├── src/
│   ├── types/           # TypeScript type definitions
│   │   └── index.ts     # User, Service, Subscription types
│   │
│   ├── utils/           # Utility functions
│   │   └── index.ts     # Date formatting, validation, etc.
│   │
│   ├── constants/       # Shared constants
│   │   └── index.ts     # API URLs, config values
│   │
│   ├── api/             # API client
│   │   └── index.ts     # HTTP client, request helpers
│   │
│   └── index.ts         # Main exports
│
├── package.json
├── tsconfig.json
└── README.md
```

## Usage

### In Webapp or Desktop

```typescript
import { UserSubscription, ServiceConfig } from '@hasod/shared/types';
import { formatDate, isValidEmail } from '@hasod/shared/utils';
import { API_BASE_URL } from '@hasod/shared/constants';
import { apiClient } from '@hasod/shared/api';

// Use shared types
const subscription: UserSubscription = {
  serviceId: 'music-library',
  status: 'active',
  // ...
};

// Use shared utilities
const formattedDate = formatDate(subscription.startDate);

// Use shared API client
const services = await apiClient.getServices();
```

### In Functions (Backend)

```typescript
import { UserSubscription, ServiceConfig } from '@hasod/shared/types';
import { validateSubscription } from '@hasod/shared/utils';

// Use shared types for consistency
function processSubscription(sub: UserSubscription) {
  // Backend logic
}
```

## Shared Types

### User Types
- `User` - User profile
- `UserSubscription` - User subscription details
- `SubscriptionStatus` - 'active' | 'expired' | 'cancelled'
- `PaymentMethod` - 'paypal' | 'manual'

### Service Types
- `ServiceConfig` - Service configuration
- `ServiceFeature` - Service feature details

### Transaction Types
- `Transaction` - Payment transaction
- `TransactionType` - Transaction categorization

### Download Types (if applicable)
- `DownloadJob` - Download job details
- `DownloadProgress` - Progress tracking

## Shared Utilities

### Date & Time
- `formatDate(date: Date): string` - Format date for display
- `isExpired(date: Date): boolean` - Check if date is past
- `addMonths(date: Date, months: number): Date` - Add months to date

### Validation
- `isValidEmail(email: string): boolean` - Email validation
- `isValidPhone(phone: string): boolean` - Phone validation

### Formatting
- `formatCurrency(amount: number, currency: string): string` - Currency formatting
- `formatFileSize(bytes: number): string` - File size formatting

## Shared Constants

```typescript
export const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://us-central1-hasod-41a23.cloudfunctions.net/api'
  : 'http://localhost:5001/hasod-41a23/us-central1/api';

export const ADMIN_EMAILS = [
  'hasod@hasodonline.com',
  'yubarkan@gmail.com'
];

export const SUBSCRIPTION_DURATIONS = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12
};
```

## API Client

Shared HTTP client with common configurations:

```typescript
import { apiClient } from '@hasod/shared/api';

// Configured with:
// - Base URL (production/development)
// - Default headers
// - Error handling
// - Request/response interceptors

// Example usage
const services = await apiClient.get('/services');
const subscription = await apiClient.post('/subscribe', data);
```

## Development

```bash
# Build the package
npm run build

# Watch for changes (during development)
npm run watch

# Clean build artifacts
npm run clean
```

## Testing

When adding new shared code:
1. Ensure it's truly shared (used in 2+ packages)
2. Add proper TypeScript types
3. Document in this README
4. Test in at least one consumer package

## Best Practices

1. **Types First**: Add types before implementation
2. **No Framework Dependencies**: Keep it framework-agnostic
3. **Pure Functions**: Utils should be pure when possible
4. **Minimal Dependencies**: Only add deps if absolutely necessary
5. **Export Organization**: Use barrel exports (index.ts)

## Migration Notes

Types previously defined in:
- `src/types.d.ts` (webapp) → `shared/src/types/`
- `functions/src/types/` (backend) → `shared/src/types/`

Should be gradually moved here to maintain single source of truth.

## Related Packages

- [`@hasod/webapp`](../webapp/) - Web application
- [`@hasod/desktop`](../desktop/) - Desktop application
- [`@hasod/functions`](../functions/) - Cloud Functions backend
