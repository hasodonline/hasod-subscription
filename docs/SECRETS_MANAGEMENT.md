# Secrets Management - Best Practices

## Overview

This document explains how secrets and environment variables are managed across different environments in the Hasod Subscription system.

## ✅ Best Practices We Follow

### 1. **GitHub Secrets** (Single Source of Truth)
All sensitive credentials are stored as GitHub repository secrets:

```
Settings → Secrets and variables → Actions → Repository secrets
```

**Current Secrets:**
- `FIREBASE_SERVICE_ACCOUNT` - For GitHub Actions to deploy
- `PAYPAL_CLIENT_ID` - PayPal API credentials
- `PAYPAL_CLIENT_SECRET` - PayPal API credentials
- `GOOGLE_SERVICE_ACCOUNT_KEY` - Google Workspace integration
- `OPENAI_API_KEY` - For transliteration service
- `DEEZER_ARL` - Deezer download authentication
- `PROXY_*` - Proxy configuration for downloads

### 2. **Local Development** (.env files - NEVER commit!)

**File:** `packages/functions/.env`
- ✅ Listed in `.gitignore`
- ✅ Used for local development only
- ✅ Contains local/development values
- ❌ NEVER committed to git
- ❌ NEVER deployed to production

**File:** `packages/functions/.env.yaml`
- ✅ Also gitignored
- ⚠️ DEPRECATED - Use `.env` instead (Firebase Functions v2 standard)

### 3. **Production Deployment** (CI/CD)

**How it works:**
1. GitHub Actions runs on push to master
2. Creates `.env` file from GitHub Secrets
3. Firebase CLI loads `.env` during deployment
4. Functions run with production secrets

**File:** `.github/workflows/deploy.yml` (lines 66-97)

```yaml
- name: Create functions environment config
  run: |
    cat > packages/functions/.env << EOF
    # All secrets from GitHub
    PAYPAL_CLIENT_ID=${{ secrets.PAYPAL_CLIENT_ID }}
    DEEZER_ARL=${{ secrets.DEEZER_ARL }}
    # ... etc
    EOF
```

## 🔐 Firebase Functions v2 Environment Variables

### What Gets Loaded:

**Firebase Functions v2 loads `.env` file automatically:**
- ✅ `.env` - Standard format (KEY=value)
- ❌ `.env.yaml` - NOT loaded by Firebase (custom format)

**Deployment log confirmation:**
```
i  functions: Loaded environment variables from .env.
```

### How to Access in Code:

```typescript
// packages/functions/src/utils/config.ts
export function getDeezerConfig(): DeezerConfig {
  return {
    arl: process.env.DEEZER_ARL || ''  // ✅ Correct
  };
}
```

## ❌ What We DON'T Use (Deprecated)

### Firebase functions:config (V1 - Deprecated)

```bash
# ❌ OLD WAY (being deprecated March 2026)
firebase functions:config:set deezer.arl="xxx"

# Access in code:
functions.config().deezer.arl  // ❌ Don't use this
```

**Why we don't use it:**
- Deprecated and will be removed March 2026
- Doesn't work with `.env` files
- Harder to manage in CI/CD

## 📋 Complete Secrets Workflow

### Adding a New Secret:

**Step 1: Add to GitHub Secrets**
```bash
gh secret set NEW_SECRET_NAME --repo hasodonline/hasod-subscription
# Paste the secret value when prompted
```

**Step 2: Update GitHub Actions**
Edit `.github/workflows/deploy.yml`:
```yaml
cat > packages/functions/.env << EOF
NEW_SECRET_NAME=${{ secrets.NEW_SECRET_NAME }}
EOF
```

**Step 3: Update Local .env (for development)**
Edit `packages/functions/.env`:
```bash
NEW_SECRET_NAME=local-development-value
```

**Step 4: Use in Code**
Edit `packages/functions/src/utils/config.ts`:
```typescript
export function getNewConfig() {
  return {
    secretValue: process.env.NEW_SECRET_NAME || ''
  };
}
```

**Step 5: Deploy**
```bash
git add .github/workflows/deploy.yml
git commit -m "feat: Add NEW_SECRET_NAME configuration"
git push origin master
# GitHub Actions will automatically deploy with the secret
```

## 🔍 Verifying Secrets in Production

**Check what's loaded:**
```bash
# Firebase Functions load .env automatically
# Check deployment logs for:
# "i  functions: Loaded environment variables from .env."
```

**Test endpoint:**
```bash
# If secret is missing, you'll see config-specific errors:
# "DEEZER_ARL not configured"
# "PayPal configuration missing"
# etc.
```

## 📁 File Structure

```
packages/functions/
├── .env                    # ✅ For local dev (gitignored)
├── .env.yaml              # ⚠️ Deprecated, use .env instead
├── .env.example           # ✓ Template (can be committed)
└── src/utils/config.ts    # ✓ Config loader
```

## ⚠️ Security Checklist

- [x] All `.env*` files in `.gitignore`
- [x] Secrets stored in GitHub Secrets
- [x] CI/CD creates `.env` from secrets
- [x] No secrets in code or committed files
- [x] `.env.example` shows structure (no values)
- [x] Production uses GitHub Secrets only
- [ ] ~~functions:config~~ (deprecated, removed)

## 🚀 Migration from .env.yaml to .env

**What changed:**
- Before: GitHub Actions created `.env.yaml` (YAML format)
- After: GitHub Actions creates `.env` (standard KEY=value format)
- Reason: Firebase Functions v2 only loads `.env`, not `.env.yaml`

**Impact:**
- ✅ Secrets now properly loaded in production
- ✅ Standard .env format (better tooling support)
- ✅ Consistent with Firebase documentation

## 📖 References

- [Firebase Functions Environment Configuration](https://firebase.google.com/docs/functions/config-env)
- [GitHub Encrypted Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)

---

**Last Updated:** 2026-01-08
**Status:** Active - Best practices implemented
