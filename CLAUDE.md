# Hasod Subscription Management System

## Quick Context

**Project Type:** Monorepo - Subscription management platform with web, desktop, and backend
**Tech Stack:** React + TypeScript, Firebase Functions, Python (desktop), Firebase hosting
**Main Commands:**
- `npm run dev` - Run webapp dev server
- `npm run functions:serve` - Run backend emulator
- `npm run build:shared` - Build shared package (required before webapp/functions)
- `npm run deploy` - Deploy everything to Firebase

## Project Structure

```
hasod-subscription/
├── packages/
│   ├── webapp/              # React web app (see packages/webapp/CLAUDE.md)
│   ├── functions/           # Firebase Cloud Functions (see packages/functions/CLAUDE.md)
│   ├── shared/              # Shared types/utils (see packages/shared/CLAUDE.md)
│   └── desktop/             # Python desktop app (see packages/desktop/CLAUDE.md)
├── docs/                    # Documentation
├── scripts/                 # Build & deployment scripts
└── CLAUDE.md               # This file
```

## Key Principles

### 1. Package Ownership
- **webapp + functions**: Web development work (React frontend + Express backend)
- **shared**: Maintained ONLY by webapp/functions developers
- **desktop**: Desktop app development (Python, reads shared package)

### 2. Shared Package Rule
⚠️ **CRITICAL**: Only webapp/functions work can modify `packages/shared/`
- Desktop app consumes shared package (read-only)
- Always build shared before using: `npm run build:shared`

### 3. Development Workflow
```bash
# 1. Install dependencies (first time)
npm install

# 2. Build shared package (when changed)
npm run build:shared

# 3. Run webapp
npm run dev

# 4. Run functions (optional, separate terminal)
npm run functions:serve
```

## Quick Start

### For Web Development
See: [packages/webapp/CLAUDE.md](packages/webapp/CLAUDE.md)
```bash
npm run dev                    # Start webapp
npm run functions:serve        # Start functions emulator
```

### For Backend API Development
See: [packages/functions/CLAUDE.md](packages/functions/CLAUDE.md)
```bash
npm run functions:build        # Build TypeScript
npm run functions:serve        # Run emulator
```

### For Desktop App Development
See: [packages/desktop/CLAUDE.md](packages/desktop/CLAUDE.md)
```bash
cd packages/desktop
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

### For Shared Code
See: [packages/shared/CLAUDE.md](packages/shared/CLAUDE.md)
```bash
npm run build:shared           # Build package
npm run watch -w @hasod/shared # Watch mode
```

## Architecture Overview

### Web Application (packages/webapp/)
- React 18 + TypeScript + Vite
- Firebase Auth (Google OAuth)
- Firestore for data
- React Router for routing
- Subscription management UI

### Backend API (packages/functions/)
- Firebase Cloud Functions v2 (Node.js 20)
- Express.js REST API
- PayPal subscription integration
- Google Workspace integration
- Download service (YouTube, Spotify)

### Desktop App (packages/desktop/)
- Python + PySide6 (Qt)
- License validation via Cloud Functions API
- Downloads: YouTube, Spotify, SoundCloud
- Requires active `hasod-downloader` subscription

### Shared Package (packages/shared/)
- TypeScript types and interfaces
- Constants (API URLs, admin emails)
- Common utilities
- Consumed by webapp, functions, and desktop

## Common Tasks

### Adding a New Feature

1. **Determine scope**: Webapp only? Backend only? Both?
2. **Navigate to package**: `cd packages/webapp` or `cd packages/functions`
3. **Read package CLAUDE.md**: For package-specific guidance
4. **Develop**: Make changes
5. **Test locally**: Run dev servers
6. **Deploy**: `npm run deploy`

### Adding Shared Types

1. **Edit**: `packages/shared/src/types/index.ts`
2. **Build**: `npm run build:shared`
3. **Import in webapp**: `import { Type } from '@hasod/shared/types'`
4. **Import in functions**: `import { Type } from '../../../shared/src/types'`

### Deploying Changes

```bash
# Build everything
npm run build

# Deploy all (hosting + functions + firestore)
npm run deploy

# Or deploy individually
firebase deploy --only hosting      # Webapp only
firebase deploy --only functions    # Functions only
```

## Environment Setup

### Required Files
- `.env` (root) - Webapp environment variables
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

## Firebase Services

- **Authentication**: Google OAuth
- **Firestore**: Database
  - Collections: `users`, `services`, `transactions`, `webhookEvents`
- **Cloud Functions**: Backend API
- **Hosting**: Static site hosting
- **Storage**: File uploads (downloads)

## Important URLs

- **Production Webapp**: https://hasod-41a23.web.app
- **API Base**: https://us-central1-hasod-41a23.cloudfunctions.net/api
- **Firebase Console**: https://console.firebase.google.com/project/hasod-41a23

## Dependencies Management

```bash
# Root workspace
npm install                           # Install all packages

# Specific package
npm install <package> -w @hasod/webapp
npm install <package> -w @hasod/functions
npm install <package> -w @hasod/shared

# Desktop app (Python)
cd packages/desktop
pip install -r requirements.txt
```

## Testing

```bash
# Run webapp locally
npm run dev

# Test functions locally
npm run functions:serve
curl http://localhost:5001/hasod-41a23/us-central1/api/services

# Test desktop app
cd packages/desktop && python main.py
```

## Documentation

- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - System design
- **[API.md](docs/API.md)** - API endpoints
- **[SETUP.md](docs/SETUP.md)** - Detailed setup
- **[TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** - Common issues

## Package-Specific Instructions

Each package has its own CLAUDE.md with detailed instructions:

- **[packages/webapp/CLAUDE.md](packages/webapp/CLAUDE.md)** - React webapp development
- **[packages/functions/CLAUDE.md](packages/functions/CLAUDE.md)** - Backend API development
- **[packages/shared/CLAUDE.md](packages/shared/CLAUDE.md)** - Shared code (types, utils)
- **[packages/desktop/CLAUDE.md](packages/desktop/CLAUDE.md)** - Desktop app development

## Rules & Conventions

### DO:
- ✅ Read package-specific CLAUDE.md before working
- ✅ Build shared package before building webapp/functions
- ✅ Test locally before deploying
- ✅ Update documentation when adding features
- ✅ Follow TypeScript strict mode

### DON'T:
- ❌ Modify `packages/shared/` from desktop app work
- ❌ Deploy without testing in emulator first
- ❌ Commit sensitive files (`.env`, `service-account-key.json`)
- ❌ Skip building shared package when it changes
- ❌ Hardcode secrets (use environment variables)

## Git Workflow

```bash
# Feature development
git checkout -b feature/your-feature
# ... make changes ...
npm run build                  # Verify builds
git add .
git commit -m "feat: Your feature description"
git push origin feature/your-feature

# Deployment
git checkout master
git pull origin master
npm run deploy
```

## Troubleshooting

### "Module not found @hasod/shared"
```bash
cd packages/shared
npm run build
```

### "Firebase deploy failed"
```bash
# Check Firebase login
firebase login

# Verify project
firebase use --add

# Check logs
firebase functions:log
```

### "Desktop app license validation fails"
- Verify `/user/subscription-status` endpoint exists in functions
- Check user has active `hasod-downloader` subscription
- Verify API URL is correct

## Support

- **Issues**: GitHub Issues
- **Email**: hasod@hasodonline.com
- **Docs**: [docs/](docs/)

---

**Last Updated**: January 2026
**Claude Code Version**: 1.0
**Project Status**: Production (webapp/functions), Beta (desktop)
