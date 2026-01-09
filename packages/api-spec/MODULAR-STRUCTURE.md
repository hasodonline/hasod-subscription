# Modular OpenAPI Structure

## Overview

The OpenAPI spec has been split from a monolithic 1,432-line file into a clean modular structure with 18 files, each under 350 lines.

**Benefits:**
- Easier to navigate and maintain
- Clear separation of concerns
- Better collaboration (less merge conflicts)
- Desktop types now included in the same spec
- All 18 API endpoints + 9 desktop types documented

## Structure

```
packages/api-spec/
├── openapi.yaml              # Main file (224 lines) - references all modules
├── info.yaml                 # API metadata (10 lines)
├── servers.yaml              # Server URLs (4 lines)
├── tags.yaml                 # API tags (16 lines)
│
├── paths/                    # API endpoints by domain
│   ├── services.yaml         # /services endpoints (34 lines)
│   ├── subscriptions.yaml    # /create-subscription, /activate-subscription (60 lines)
│   ├── user.yaml             # /user/subscription-status (27 lines)
│   ├── admin.yaml            # /admin/* endpoints (213 lines)
│   ├── transliteration.yaml  # /transliterate (34 lines)
│   └── metadata.yaml         # /metadata/*, /download/* (170 lines)
│
├── schemas/                  # Type definitions by domain
│   ├── common.yaml           # ErrorResponse, SuccessResponse (20 lines)
│   ├── service.yaml          # Service, AdminServiceRequest, etc. (142 lines)
│   ├── subscription.yaml     # Subscription types (147 lines)
│   ├── transaction.yaml      # ManualTransaction, ManualPayment (116 lines)
│   ├── user.yaml             # User subscription status (11 lines)
│   ├── metadata.yaml         # Spotify, Deezer, Transliteration (326 lines)
│   └── desktop.yaml          # NEW - Desktop app types (257 lines)
│
└── responses/                # Reusable response definitions
    └── errors.yaml           # 4xx errors (27 lines)
```

## Desktop Types (NEW)

The spec now includes types used by the Tauri desktop app:

### Core Types
- **MusicService** - Enum for music services (youtube, spotify, soundcloud, deezer)
- **DownloadStatus** - Enum for download states (pending, downloading, completed, etc.)
- **TrackMetadata** - Track information (title, artist, album, ISRC, etc.)
- **DownloadContext** - Album/playlist context for batch downloads

### Download Management
- **DownloadJob** - Individual download job with progress tracking
- **QueueStatus** - Overall queue status with job counts

### Authentication & License
- **LicenseStatus** - Subscription validation for desktop app
- **OAuthStartResult** - OAuth flow initiation
- **StoredAuth** - Local authentication storage

## File Size Analysis

| Category | Files | Total Lines | Avg Lines/File |
|----------|-------|-------------|----------------|
| Paths | 6 | 538 | 90 |
| Schemas | 7 | 1,019 | 146 |
| Responses | 1 | 27 | 27 |
| Metadata | 3 | 30 | 10 |
| **Main** | 1 | 224 | 224 |
| **Total** | **18** | **1,838** | **102** |

**Original file:** 1,432 lines (monolithic)
**New structure:** 1,838 lines across 18 files (average 102 lines/file)
**Main file:** 224 lines (84% reduction)

## Usage

### Validation
```bash
npm run validate
```
Output: ✅ Valid with 3 warnings (localhost URL, missing 4xx responses)

### Generate Types
```bash
npm run generate:ts
```
Output: `packages/webapp/src/api/schema.d.ts`

**Desktop types now included:**
```typescript
import type { components } from './schema';

type DownloadJob = components['schemas']['DownloadJob'];
type LicenseStatus = components['schemas']['LicenseStatus'];
type QueueStatus = components['schemas']['QueueStatus'];
```

### Build Documentation
```bash
npm run docs           # Preview with hot reload
npm run build-docs     # Build HTML
```

## How References Work

OpenAPI 3.1 uses JSON Pointer syntax for references. The `~1` represents `/` in the path.

### Path References
```yaml
# In openapi.yaml
/services:
  $ref: './paths/services.yaml#/~1services'

# In paths/services.yaml
/services:
  get:
    operationId: getServices
    # ...
```

### Schema References
```yaml
# In openapi.yaml
schemas:
  Service:
    $ref: './schemas/service.yaml#/Service'

# In paths/services.yaml
schema:
  $ref: '../schemas/service.yaml#/ServicesResponse'
```

### Response References
```yaml
# In openapi.yaml
responses:
  NotFound:
    $ref: './responses/errors.yaml#/NotFound'

# In paths/services.yaml
responses:
  '404':
    $ref: '../responses/errors.yaml#/NotFound'
```

## Adding New Endpoints

### 1. Add path definition
```yaml
# paths/new-feature.yaml
/new-endpoint:
  post:
    operationId: doSomething
    tags: [NewFeature]
    requestBody:
      content:
        application/json:
          schema:
            $ref: '../schemas/new-feature.yaml#/NewRequest'
    responses:
      '200':
        content:
          application/json:
            schema:
              $ref: '../schemas/new-feature.yaml#/NewResponse'
```

### 2. Add schema definitions
```yaml
# schemas/new-feature.yaml
NewRequest:
  type: object
  required: [field1]
  properties:
    field1:
      type: string

NewResponse:
  type: object
  properties:
    success:
      type: boolean
```

### 3. Reference in main file
```yaml
# openapi.yaml
paths:
  /new-endpoint:
    $ref: './paths/new-feature.yaml#/~1new-endpoint'

components:
  schemas:
    NewRequest:
      $ref: './schemas/new-feature.yaml#/NewRequest'
    NewResponse:
      $ref: './schemas/new-feature.yaml#/NewResponse'
```

### 4. Validate and generate
```bash
npm run validate
npm run generate:ts
```

## Migration Notes

### What Changed
- ✅ Spec split into 18 modular files
- ✅ Desktop types added (9 new schemas)
- ✅ File sizes reduced (max 326 lines)
- ✅ All references updated
- ✅ Validation passes
- ✅ Type generation works
- ✅ Backward compatible

### What Stayed the Same
- ✅ All 18 API endpoints unchanged
- ✅ All request/response schemas unchanged
- ✅ Generated TypeScript types compatible
- ✅ API behavior unchanged
- ✅ No breaking changes

### Backup
Original file backed up as: `openapi.yaml.backup`

```bash
# To restore original (if needed)
mv openapi.yaml.backup openapi.yaml
```

## Best Practices

### File Organization
- Group related endpoints in path files (max 200 lines)
- Group related schemas in schema files (max 300 lines)
- Use descriptive file names (plural for collections)
- Keep common types in `common.yaml`

### References
- Use relative paths (`./`, `../`)
- Use JSON Pointer syntax (`#/SchemaName`)
- Always reference through main `openapi.yaml` for cross-file refs
- Keep references local when possible

### Maintenance
- Add new endpoints to appropriate path files
- Add new schemas to appropriate schema files
- Update main `openapi.yaml` to expose new components
- Run validation after every change
- Regenerate types after spec changes

## Tools Compatibility

| Tool | Status | Notes |
|------|--------|-------|
| Redocly CLI | ✅ Working | Validation passes |
| openapi-typescript | ✅ Working | Types generated successfully |
| Swagger UI | ✅ Working | Loads spec correctly |
| Postman | ✅ Working | Can import modular spec |
| VS Code | ✅ Working | IntelliSense works |

## Future Enhancements

### Possible Additions
- [ ] Add desktop API endpoints (if desktop calls backend directly)
- [ ] Add webhook schemas for external services
- [ ] Add batch operation endpoints
- [ ] Split large schema files further (metadata.yaml is 326 lines)
- [ ] Add examples to all endpoints
- [ ] Add response headers documentation

### Maintenance
- Keep files under 200 lines where possible
- Review and update desktop types as app evolves
- Consider splitting `metadata.yaml` if it grows beyond 400 lines
- Document breaking changes in CHANGELOG.md

---

**Created:** January 2026
**Original Size:** 1,432 lines (monolithic)
**New Size:** 224 lines main + 1,614 lines modules = 1,838 lines (18 files)
**Reduction:** 84% reduction in main file size
**New Types:** 9 desktop schemas added
