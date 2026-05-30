# Future RVI Underwriting Certificate Design

Date: 2026-05-30
Status: approved concept boundary, not approved for implementation
Owner: GCSC SmartContractor

## Decision

Future RVI starts as an internal underwriting certificate.

The first version is not tradable, not investor-facing, not a profit-share product, not a security offering, not a derivative, and not a promise that a property will increase in value. It is a controlled internal record that helps GCSC estimate whether a signed renovation contract can support a future financing review.

This design is intentionally conservative. It keeps the product useful for underwriting while avoiding unsupported claims about real estate appreciation, bank reappraisals, investor returns, or automatic credit approval.

## Problem

Homeowners often want renovations that may increase property value, but they may not want to spend cash upfront. Contractors need confidence that materials and milestone payments will be funded. GCSC already has the foundations for contractor verification, project bids, milestone escrow, financing prechecks, audit logs, WebAuth wallet metadata, and XPR settlement evidence.

Future RVI connects those pieces by creating a structured certificate around:

- a signed homeowner-contractor project;
- a renovation scope and budget;
- current estimated property value;
- projected after-renovation value;
- confidence/risk score;
- maximum safe advance recommendation;
- audit and escrow links.

## Approaches Considered

### Option A - Internal Underwriting Certificate

The certificate is an internal platform record. It is non-transferable and used only by GCSC admins, the Risk Assessment Agent, the Real Estate Agent, and future approved financing partners.

Pros:

- Lowest regulatory blast radius for MVP.
- Fits existing financing precheck and audit workflow.
- Can be tested without real money.
- Does not require investor marketplace, custody, transfer rules, or token sale language.

Cons:

- Does not create immediate liquidity by itself.
- Requires a lending partner, treasury policy, or manual admin review before real funds.

Decision: choose this for MVP.

### Option B - Partner-Lender Renovation Advance

The certificate becomes an underwriting packet for a licensed lender or approved financing partner. Legal loan documents, lien rules, disclosures, and repayment terms live off-chain. The on-chain or database certificate tracks evidence and state, not legal ownership by itself.

Pros:

- Can become a real revenue product.
- Keeps regulated lending with a qualified partner.
- Creates a path to contractor material advances or milestone-backed credit.

Cons:

- Requires legal review, lender partner, state eligibility rules, disclosures, and servicing workflow.

Decision: phase 2 only, after MVP certificate is proven.

### Option C - Tradable Future RWA Token

The certificate is sold or traded as a token that gives third parties exposure to future property value increase.

Pros:

- Highest liquidity potential.
- Could become a broader RWA marketplace.

Cons:

- Highest regulatory risk.
- May trigger securities, derivatives, mortgage, consumer-credit, servicing, and state law analysis.
- Cannot be marketed safely without counsel and licensed partners.

Decision: explicitly out of scope for MVP.

## Product Boundary

Future RVI v1 may say:

- "estimated renovation value certificate";
- "internal underwriting record";
- "future financing review input";
- "non-transferable";
- "not a guarantee";
- "not a loan approval";
- "not a property ownership interest";
- "not a promise of appreciation".

Future RVI v1 must not say:

- "guaranteed property value increase";
- "bank will automatically reappraise";
- "homeowner has no risk";
- "investors earn upside";
- "tradeable future real estate asset";
- "approved credit";
- "liquid collateral";
- "real-money ready".

## Core Entities

### Future RVI Certificate

Suggested backend fields:

```text
id
project_id
homeowner_user_id
contractor_user_id
property_address_hash
property_state
scope_hash
contract_hash
current_value_estimate_cents
after_repair_value_estimate_cents
estimated_value_delta_cents
renovation_budget_cents
requested_advance_cents
max_recommended_advance_cents
ltv_after_repair_bps
confidence_score
risk_score
status
created_by
created_at
updated_at
expires_at
legal_review_required
financing_partner_required
notes
```

### Certificate Status

```text
draft
estimated
review_requested
admin_review
approved_for_precheck
rejected
expired
cancelled
```

The status must not include `funded`, `tradable`, or `loan_approved` in v1.

### Audit Events

```text
future_rvi.created
future_rvi.estimated
future_rvi.review_requested
future_rvi.approved_for_precheck
future_rvi.rejected
future_rvi.expired
future_rvi.cancelled
```

Audit events must include actor, entity id, project id, and non-secret risk metadata. They must not include full property address, private documents, bank credentials, or owner financial secrets.

## Lifecycle

1. Homeowner creates a project.
2. Contractor submits a bid.
3. Homeowner accepts a verified contractor bid.
4. Platform creates or updates escrow/milestone records.
5. Homeowner requests Future RVI review.
6. Real Estate Agent estimates current value and after-renovation value using safe inputs.
7. Risk Assessment Agent calculates confidence, value delta, LTV, and max recommended advance.
8. System creates a non-transferable Future RVI certificate in `draft` or `estimated`.
9. Admin reviews the certificate packet.
10. Admin may mark it `approved_for_precheck` or `rejected`.
11. If later connected to a financing partner, the partner performs real underwriting outside this MVP.

## Data Inputs

Allowed MVP inputs:

- project scope;
- contractor bid amount;
- milestone schedule;
- property state and coarse geography;
- owner-provided property details;
- comparable-value estimate from an approved source;
- admin-entered notes;
- document hashes.

Blocked MVP inputs unless approved:

- bank login credentials;
- title company credentials;
- credit pull;
- SSN;
- full consumer loan application;
- live appraisal order;
- lien filing;
- automatic HELOC or mortgage origination.

## Risk Model

MVP risk scoring should be explainable and conservative.

Suggested components:

- contractor verification status;
- contractor dispute history;
- bid amount compared with estimated property value;
- value delta confidence;
- renovation category risk;
- project state eligibility;
- documentation completeness;
- existing escrow/milestone structure.

The first scoring version should produce:

```text
confidence_score: 0-100
risk_score: 0-100
max_recommended_advance_cents
decision: review_only | not_recommended | eligible_for_manual_review
```

The system must not auto-approve real loans in v1.

## Architecture

Future RVI v1 fits the existing three-layer model:

### Layer 1 - Product Layer

Backend stores certificates, statuses, risk scores, and audit events. Dashboard displays a clear "review only" certificate packet for homeowner/admin workflows.

### Layer 2 - Settlement Layer

Existing XPR escrow remains the payment settlement path. Future RVI v1 does not mint a transferable chain token. If a chain proof is needed later, use a non-transferable memo/certificate hash only after legal review.

### Layer 3 - Autonomous DeFi Layer

AI agents may prepare estimates and risk packets. They may not approve real credit, file liens, transfer funds, or represent legal conclusions.

## Security And Privacy

- Store only hashed property address in the certificate record.
- Keep full address, documents, and sensitive owner data in restricted profile/document tables if needed.
- Add rate limits to certificate create/review endpoints.
- Add admin-only access to review packets.
- Add role checks so contractors cannot see owner-sensitive valuation details unless explicitly allowed.
- Log every trust-sensitive change.
- Never put secrets, private keys, bank credentials, or full consumer credit data in audit metadata.

## Legal And Compliance Guardrails

Future RVI v1 is a product-design and underwriting tool, not legal approval.

Required before real-money activation:

- attorney review for home equity, consumer credit, mortgage/lien, and state licensing issues;
- review of whether any role requires mortgage loan originator or lending licenses;
- partner-lender structure if funds are advanced;
- property/title/lien document workflow;
- consumer disclosures;
- adverse action and fair lending review if credit decisions are made;
- securities/derivatives review before any transferable token, investor participation, yield, or appreciation sharing.

Relevant public references:

- CFPB HELOC explainer: https://www.consumerfinance.gov/ask-cfpb/what-is-a-home-equity-line-of-credit-heloc-en-107/
- CFPB home equity loan vs HELOC explainer: https://www.consumerfinance.gov/ask-cfpb/what-is-the-difference-between-a-home-equity-loan-and-a-home-equity-line-of-credit-heloc-en-247/
- SEC crypto asset transaction guidance: https://www.sec.gov/resources-small-businesses/capital-raising-building-blocks/transactions-involving-crypto-assets
- CFTC tokenized collateral pilot announcement: https://www.cftc.gov/PressRoom/PressReleases/9146-25

## MVP User Experience

Homeowner dashboard:

- "Request Future RVI review" after a verified bid is accepted.
- Shows estimated value range, confidence, and review-only status.
- Clear disclaimer: not loan approval, not appraisal, not guarantee.

Contractor dashboard:

- Shows whether the project has a Future RVI review status.
- Does not show owner-sensitive valuation details by default.
- May show "advance review pending" only if owner and admin permit.

Admin dashboard:

- Future RVI queue.
- Certificate packet with project, contractor verification, risk score, value estimate, budget, and recommended max advance.
- Approve for precheck or reject with note.
- Audit log link.

## Testing Strategy

Backend tests:

- create certificate only for authenticated homeowner;
- reject certificate creation before verified bid acceptance;
- require admin for review decision;
- store property address hash, not full address, in certificate table;
- audit all certificate lifecycle events;
- reject unsupported statuses such as `funded` or `tradable`.

Frontend validators:

- homeowner sees request CTA only after accepted verified bid;
- contractor does not see sensitive owner valuation details;
- admin review requires rejection note;
- all copy avoids guarantee, investor upside, and real-money readiness claims.

Production smoke:

- public routes do not expose certificate data;
- admin-only endpoints return HTTP 401 without JWT and HTTP 403 for non-admin users.

## Implementation Phases

### Phase 1 - Documentation And Data Model

- Add product spec.
- Add PostgreSQL migration for `future_rvi_certificates`.
- Add audit event names.
- Add backend tests first.

### Phase 2 - Backend MVP

- Add certificate creation endpoint.
- Add admin review endpoints.
- Add risk packet generator with deterministic placeholder scoring.
- Add audit events.

### Phase 3 - Dashboard MVP

- Add homeowner request UI.
- Add admin review UI.
- Add contractor status indicator without sensitive details.
- Add validators for legal copy.

### Phase 4 - Partner-Ready Packet

- Export non-secret underwriting packet.
- Add admin evidence workflow.
- Prepare lender/legal review checklist.

### Phase 5 - Regulated Product Review

- Only after legal and partner review, evaluate lien, lender, HELOC, shared appreciation, or RWA/token paths.

## Open Decisions Before Implementation

1. Which property data provider or estimate source is allowed for MVP estimates.
2. Whether MVP stores full property address in an existing restricted table or only keeps a hash.
3. Which states are allowed for pilot testing.
4. Whether certificate review appears under Financing Review or as a separate Admin Future RVI tab.

## Approval Gate

Implementation may start only after the founder confirms this written design is acceptable.
