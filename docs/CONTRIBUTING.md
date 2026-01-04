# Contributing to Hasod Subscription Management

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `npm install && cd functions && npm install`
3. Copy `.env.example` to `.env` and configure
4. Run locally: `npm run dev`

## Code Style

### TypeScript
- Use strict mode
- Explicit return types for functions
- Interfaces over types
- No `any` - use proper types

### React
- Functional components with hooks
- Props interfaces for all components
- Keep components focused (single responsibility)
- Extract logic to custom hooks

### Backend
- Service layer pattern (see `functions/src/services/`)
- Routes only handle HTTP concerns
- Use custom error classes
- Comprehensive error logging

### Naming Conventions
- Files: `kebab-case.tsx`
- Components: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Service IDs: `kebab-case`

## Git Workflow

### Branches
- `main` - Production code
- `develop` - Development code
- Feature branches: `feature/description`
- Bug fixes: `fix/description`

### Commits
Use conventional commits:
```
feat: add manual payment modal
fix: resolve PayPal webhook parsing
docs: update API documentation
refactor: extract subscription logic to service
test: add subscription service tests
```

## Testing

```bash
# Frontend tests
npm test

# Manual API testing
npm run functions:build
firebase emulators:start
```

## Pull Request Process

1. Create feature branch from `develop`
2. Make changes following code style
3. Update documentation if needed
4. Test locally
5. Submit PR to `develop`
6. Address review comments
7. Squash and merge

## Documentation

When making changes, update:
- **README.md** - If user-facing features change
- **ARCHITECTURE.md** - If system design changes
- **API.md** - If API endpoints change
- **.github/claude.md** - If development patterns change
- **Inline comments** - For complex logic

## Security

- Never commit credentials (`.env`, service account keys)
- Review security implications of changes
- Follow principle of least privilege
- Report security issues privately

## Questions?

- Check [README.md](./README.md) for overview
- Check [ARCHITECTURE.md](./ARCHITECTURE.md) for system design
- Check [.github/claude.md](./.github/claude.md) for AI assistance
- Open an issue for questions

---

Thank you for contributing!
