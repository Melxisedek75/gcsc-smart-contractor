# GCSC Smart Contractor v2.0

**Secure P2P Construction Marketplace** — powered by XPR Network (Proton Blockchain)

## What is GCSC?

GCSC Smart Contractor connects construction homeowners with contractors using blockchain smart contracts for trustless, transparent transactions.

## v2.0 Security Upgrade

This version fixes all 51 security vulnerabilities from v1.0:

- 9 security layers (Helmet.js, Rate Limiting, JWT, CORS whitelist, Input validation)
- PostgreSQL database (no more in-memory storage)
- Email verification with OTP
- AES-256-GCM encryption for private keys
- Zero XSS vulnerabilities (safe DOM construction)
- Content Security Policy (CSP)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 20 + Express |
| Frontend | Vanilla JS + Tailwind CSS |
| Database | PostgreSQL 15 |
| Crypto | secp256k1 + AES-256-GCM + PBKDF2 (600k) |
| Storage | Google Drive (encrypted keys) |
| Auth | JWT + server-side blacklist |
| Deploy | Docker + Railway |

## Quick Start

Local development:
```bash
npm install
npm start
```

With Docker:
```bash
docker-compose up
```

## Documentation

- [SECURITY.md](SECURITY.md) — Security features and checklist
- [START-HERE.sh](START-HERE.sh) — Automated setup script

## Created For

**Serhiy** — Construction businessman from Washington State, USA

## License

UNLICENSED — All rights reserved
