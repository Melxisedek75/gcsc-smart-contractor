# SmartContractor Financing Readiness

This document describes the current demo/MVP readiness scope for future GCSC and SmartContractor financing workflows.

## Current Status

SmartContractor Financing is not a live lending product. The current implementation is an informational and precheck workflow only.

The platform can record a user interest/precheck record for future review, but it does not issue funds, approve credit, lock tokens, liquidate collateral, assign insurance benefits, route insurance claim payouts, or route repayments.

## Product Directions

### Escrow-Backed Contractor Advance

For contractors. A future workflow where a verified contractor may request a limited advance when a homeowner has already funded escrow for a project.

Demo rule idea:

`max advance = min(20% escrow balance, 50% next milestone, risk limit)`

Current gate: demo/MVP precheck only. No live funds are issued.

### Token-Collateral Equipment Credit

For contractors. A future workflow where declared GCSC token collateral may support equipment or material credit.

Demo rule idea:

`max credit = min(25% declared collateral, risk limit)`

Current gate: demo/MVP precheck only. No token lock, liquidation, or live lending is active.

### ClaimBridge Emergency Advance

For homeowners. A future workflow for insured property damage scenarios such as fire, water damage, flood, storm, roof damage, or similar events.

Demo rule idea:

`max advance = min(20% estimated insurance payout, risk limit)`

Current gate: demo/MVP precheck only. No assignment of benefits, insurer integration, or claim payout routing is active.

### Contract-Backed Working Capital

For contractors. A future workflow where a verified signed construction contract may support a working capital review.

Demo rule idea:

`max advance = min(20% contract amount, risk limit)`

Current gate: demo/MVP precheck only. No live loan issuance or repayment routing is active.

## Required Future Gates

Before any real-money activation, each workflow requires:

- identity verification;
- contractor verification where applicable;
- state eligibility review;
- admin review;
- legal/provider review;
- security review;
- final approval;
- production monitoring and rollback plan;
- written operating procedure for disputes, denials, corrections, and user notices.

## State Compliance Research

The 50-state materials produced by Kimi or other AI agents must be treated as research drafts only.

They are not legal advice and must not be used as final state eligibility logic until reviewed by qualified counsel and approved providers.

Allowed current use:

- internal research;
- UI notices that explain state-aware review is required;
- draft checklists for future legal/provider review.

Not allowed current use:

- automatic legal approval;
- state-by-state lending activation;
- insurance claim assignment;
- real payment routing;
- token collateral lock or liquidation.

## Backend Scope Implemented

The backend may store `financing_prechecks` as demo/MVP review records. These records are user intent signals only.

Audit action:

`financing.precheck.created`

Admin endpoint:

`GET /api/admin/financing-prechecks`

User endpoints:

`POST /api/financing/prechecks`

`GET /api/financing/prechecks`

