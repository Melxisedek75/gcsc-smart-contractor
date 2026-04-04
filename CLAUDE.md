# GCSC Smart ContractOR — Claude Instructions

## Repository
- GitHub: `Melxisedek75/gcsc-smart-contractor`
- Main branch: `main`

## MANDATORY: Deploy to GitHub After Every Change

After completing ANY new feature, file creation, or code change, you MUST:

1. Create a feature branch: `git checkout -b claude/<short-feature-name>`
2. Stage changed files: `git add <specific files>`
3. Commit with a clear message
4. Push: `git push -u origin <branch>`
5. Create a PR and immediately merge it to `main`

**Never leave changes only locally. Always push to GitHub.**

### Branch naming
- Use lowercase with hyphens: `claude/escrow-engine`, `claude/verify-scope`, etc.

### Commit message format
```
feat: short description

Detailed explanation of what was built and why.
```

## Project Stack
- Backend: Node.js + Express (`smart-contractor-backend.js`)
- Frontend: Single HTML file (`smart-contractor-app.html`)
- Verification: `vergent-verify.js` (Verify→Discover→Prove)
- Escrow: `escrow-engine.js` (AI-gated milestone payments)
- Network: XPR Network (Proton / EOSIO)
- Encryption: AES-256-GCM for private keys

## Architecture Rules
- Every financial action must go through `vergent-verify.js` before execution
- No payment releases without a TRUSTED verdict
- All state changes must be logged in `escrow.auditLog`
- Never expose private keys in API responses
