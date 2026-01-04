# Hasod Subscription Management System

A modern, full-stack subscription management platform supporting multiple services, dual payment methods (PayPal + manual), and automated Google Workspace integration.

## 📦 Monorepo Structure

This project is organized as a monorepo with multiple packages:

```
hasod-subscription/
├── packages/
│   ├── webapp/              # React web application
│   ├── desktop/             # Desktop app (Electron/Tauri) - Coming soon
│   ├── functions/           # Firebase Cloud Functions (Backend API)
│   └── shared/              # Shared types, utilities, and API client
│
├── docs/                    # Documentation
├── config/firebase/         # Firebase configuration
├── scripts/                 # Build and deployment scripts
└── .github/                 # GitHub workflows
```

## 🚀 Quick Start

### Prerequisites
- Node.js 20+ and npm 9+
- Firebase CLI (`npm install -g firebase-tools`)
- Firebase project with Blaze plan
- PayPal Developer account
- Google Workspace account (for group management)

### Installation

```bash
# Clone repository
git clone <repository-url>
cd hasod-subscription

# Install all dependencies (uses npm workspaces)
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Firebase credentials
```

### Development

```bash
# Terminal 1: Run webapp dev server
npm run dev

# Terminal 2: Run functions emulator (optional)
npm run functions:serve
```

Visit http://localhost:5000

### Building

```bash
# Build all packages
npm run build

# Or build individually
npm run build:webapp
npm run build:functions
npm run build:shared
```

### Deployment

```bash
# Deploy everything to Firebase
npm run deploy

# Or deploy individually
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules
```

## 📚 Documentation

Comprehensive documentation is available in the [`docs/`](./docs/) folder:

- **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - System design and data models
- **[SETUP.md](./docs/SETUP.md)** - Detailed setup instructions
- **[API.md](./docs/API.md)** - API reference
- **[CONTRIBUTING.md](./docs/CONTRIBUTING.md)** - Development guidelines
- **[TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)** - Common issues and solutions
- **[DEPLOYMENT_STATUS.md](./docs/DEPLOYMENT_STATUS.md)** - Deployment status and checklist

## 📱 Applications

### Web Application ([`packages/webapp/`](./packages/webapp/))

React + TypeScript web application with:
- Google OAuth authentication
- Multi-service subscription management
- PayPal and manual payment support
- Admin dashboard
- Developer tools

**Tech Stack:** React 18, Vite, Firebase, React Router, Axios

### Desktop Application ([`packages/desktop/`](./packages/desktop/))

**Coming Soon** - Native desktop app for Windows and macOS featuring:
- Offline access
- Background sync
- Native integrations
- License management via webapp

### Backend API ([`packages/functions/`](./packages/functions/))

Firebase Cloud Functions (Node.js 20, Gen 2) providing:
- REST API for subscriptions
- PayPal integration
- Google Workspace integration
- Download service (yt-dlp, Spotify)
- Webhook handling

### Shared Package ([`packages/shared/`](./packages/shared/))

Common code shared across all applications:
- TypeScript type definitions
- Utility functions
- API client
- Constants

## 🔑 Key Features

### For Users
- **Multi-Service Subscriptions** - Subscribe to multiple services independently
- **Dual Payment Options** - PayPal automatic or manual payments
- **Real-Time Status** - Track subscription status and expiration
- **Download Service** - Download content from Spotify, YouTube, and more
- **Bilingual Interface** - Hebrew and English support

### For Administrators
- **User Management Dashboard** - View all users and subscriptions
- **Manual Payment Processing** - Process cash/bank transfers
- **Google Group Management** - Automatic membership management
- **Transaction History** - Complete audit trail
- **Service Configuration** - Add/edit services dynamically

## 🛠️ Tech Stack

**Frontend:**
- React 18 + TypeScript + Vite
- Firebase Authentication & Firestore
- React Router v7
- Axios for API calls

**Backend:**
- Firebase Cloud Functions (Node.js 20, Gen 2)
- Express.js for HTTP routing
- Firebase Admin SDK
- Google APIs (Workspace)
- yt-dlp for downloads
- Spotify Web API

**Services:**
- Firebase (Auth, Firestore, Hosting, Functions, Storage)
- PayPal Billing Plans API
- Google Workspace Admin API

## 🧪 Testing

```bash
# Run tests
npm test

# Run functions emulator
firebase emulators:start

# Test specific service
npm run test -w @hasod/functions
```

## 📝 Configuration

### Firebase Setup

```bash
firebase login
firebase use --add  # Select your project
```

### PayPal Configuration

```bash
firebase functions:config:set \
  paypal.client_id="YOUR_CLIENT_ID" \
  paypal.client_secret="YOUR_SECRET" \
  paypal.sandbox="true"
```

See [SETUP.md](./docs/SETUP.md) for complete configuration instructions.

## 🤝 Contributing

See [CONTRIBUTING.md](./docs/CONTRIBUTING.md) for development guidelines, code style, and pull request process.

## 📊 Project Status

**Production:** https://hasod-41a23.web.app
**API:** https://us-central1-hasod-41a23.cloudfunctions.net/api
**Status:** 80% complete (frontend polish needed)

### Roadmap
- [x] Multi-service architecture
- [x] PayPal subscription integration
- [x] Manual payment processing
- [x] Admin dashboard
- [x] Download service (YouTube, Spotify)
- [ ] Desktop application
- [ ] Enhanced UI/UX
- [ ] Email notifications
- [ ] Automated testing suite

## 📄 License

[Add your license here]

## 📧 Support

- **Users:** hasod@hasodonline.com
- **Issues:** [GitHub Issues](./issues)
- **Documentation:** [docs/](./docs/)

---

**Made with ❤️ by Hasod Online**
