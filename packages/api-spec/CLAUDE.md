# API Specification - Hasod Subscription System

## TL;DR

**What:** OpenAPI 3.1 specification - Single source of truth for all API contracts
**Spec File:** `openapi.yaml`
**Commands:**
- `npm run validate` - Validate the spec
- `npm run generate:ts` - Generate TypeScript types
- `npm run docs` - Preview API documentation

**CRITICAL:** All API changes MUST start here. Update spec first, then implement.

## Spec-First Development Workflow

### 1. Define API Contract
Edit `openapi.yaml` to add or modify endpoints:

```yaml
paths:
  /new-endpoint:
    post:
      operationId: createThing
      summary: Create a new thing
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateThingRequest'
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CreateThingResponse'

components:
  schemas:
    CreateThingRequest:
      type: object
      required: [name]
      properties:
        name:
          type: string
    CreateThingResponse:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
```

### 2. Validate Spec
```bash
npm run validate
```

### 3. Generate Types
```bash
npm run generate:ts
# Output: packages/webapp/src/api/schema.d.ts
```

### 4. Implement Backend
Add endpoint in `packages/functions/src/index.ts`

### 5. Use Generated Types in Frontend
```typescript
import type { components } from './schema';
type CreateThingRequest = components['schemas']['CreateThingRequest'];
```

## Quick Commands

```bash
# Validate OpenAPI spec
npm run validate

# Generate TypeScript types for webapp
npm run generate:ts

# Generate all clients
npm run generate:all

# Preview API documentation
npm run docs

# Build HTML documentation
npm run build-docs
```

## Project Structure

```
packages/api-spec/
├── openapi.yaml          # OpenAPI 3.1 specification
├── package.json          # Build scripts and dependencies
├── CLAUDE.md            # This file
└── docs/                 # Generated documentation (gitignored)
    └── index.html
```

## OpenAPI Spec Structure

```yaml
openapi: 3.1.0
info:
  title: Hasod Subscription API
  version: 1.0.0

servers:
  - url: https://us-central1-hasod-41a23.cloudfunctions.net/api
  - url: http://localhost:5001/hasod-41a23/us-central1/api

tags:
  - name: Services
  - name: Subscriptions
  - name: User
  - name: Admin

paths:
  /services: ...
  /create-subscription: ...
  # ... 14 endpoints total

components:
  schemas:
    Service: ...
    # ... all request/response types
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
```

## API Endpoints (14 total)

### Services (Public)
| Method | Path | Operation |
|--------|------|-----------|
| GET | /services | getServices |
| GET | /services/{serviceId} | getService |

### Subscriptions
| Method | Path | Operation |
|--------|------|-----------|
| POST | /create-subscription | createSubscription |
| POST | /activate-subscription | activateSubscription |
| POST | /paypal-webhook | handlePaypalWebhook |

### User
| Method | Path | Operation |
|--------|------|-----------|
| GET | /user/subscription-status | getSubscriptionStatus |

### Admin
| Method | Path | Operation |
|--------|------|-----------|
| POST | /admin/services | createOrUpdateService |
| DELETE | /admin/services/{serviceId} | deleteService |
| POST | /admin/manual-payment | processManualPayment |
| GET | /admin/manual-transactions | getAllTransactions |
| GET | /admin/manual-transactions/{userId} | getUserTransactions |
| POST | /admin/cancel-subscription | adminCancelSubscription |
| POST | /admin/manage-group | manageGoogleGroup |
| POST | /admin/migrate-users | migrateUsers |
| POST | /admin/seed-services | seedServices |

## Generated Output

### TypeScript (webapp)
**Output:** `packages/webapp/src/api/schema.d.ts`

**Usage:**
```typescript
import type { components, paths, operations } from './schema';

// Access schema types
type Service = components['schemas']['Service'];
type ManualTransaction = components['schemas']['ManualTransaction'];

// Access operation types
type GetServicesResponse = operations['getServices']['responses']['200']['content']['application/json'];
```

## Adding New Endpoint

### Step 1: Add path in openapi.yaml
```yaml
paths:
  /my-endpoint:
    post:
      operationId: myOperation
      tags: [MyTag]
      summary: Description of what this does
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/MyRequest'
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MyResponse'
        '400':
          $ref: '#/components/responses/BadRequest'
```

### Step 2: Add schema types
```yaml
components:
  schemas:
    MyRequest:
      type: object
      required: [field1]
      properties:
        field1:
          type: string
        field2:
          type: integer

    MyResponse:
      type: object
      required: [success]
      properties:
        success:
          type: boolean
        data:
          type: object
```

### Step 3: Validate and generate
```bash
npm run validate
npm run generate:all
```

## Schema Design Guidelines

### Required Fields
Always specify required fields:
```yaml
MyType:
  type: object
  required: [id, name]  # Required fields
  properties:
    id:
      type: string
    name:
      type: string
    optional:           # Not in required = optional
      type: string
```

### Enums
Use enums for fixed values:
```yaml
SubscriptionStatus:
  type: string
  enum: [active, pending, canceled, expired, suspended, none]
```

### Reusable Responses
Define common responses:
```yaml
components:
  responses:
    BadRequest:
      description: Bad request
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
```

### References
Use $ref for reusability:
```yaml
requestBody:
  content:
    application/json:
      schema:
        $ref: '#/components/schemas/ExistingSchema'
```

## Validation Rules

The spec is validated with Redocly CLI. Common issues:

### Security
All endpoints should have security defined (or explicitly `security: []` for public):
```yaml
paths:
  /public-endpoint:
    get:
      security: []  # Explicitly public
```

### Responses
All operations should have at least one 4xx response:
```yaml
responses:
  '200':
    description: Success
  '400':
    $ref: '#/components/responses/BadRequest'
```

## Tools & Dependencies

| Tool | Purpose |
|------|---------|
| @redocly/cli | Spec validation and documentation |
| openapi-typescript | TypeScript type generation |

## Integration with Other Packages

### Webapp
- Imports types from `src/api/schema.d.ts`
- API modules re-export types for convenience
- Axios client uses generated types

### Functions
- References spec for request/response shapes
- Keep implementation in sync with spec

### Desktop
- Types documented in spec
- Rust types manually synced (only 1 endpoint used)

## Related Documentation

- [Root CLAUDE.md](../../CLAUDE.md) - Project overview
- [Webapp CLAUDE.md](../webapp/CLAUDE.md) - Frontend usage
- [Functions CLAUDE.md](../functions/CLAUDE.md) - Backend implementation
- [Skill: webapp-backend](../../.claude/skills/webapp-backend/SKILL.md) - Development workflow

---

**Package:** @hasod/api-spec
**Spec Version:** OpenAPI 3.1
**Purpose:** Single source of truth for API contracts
