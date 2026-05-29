# XPR Escrow Settlement Specification

Date: 2026-05-29

Scope: define the exact signed XPR/WebAuth escrow settlement path before adding more money-movement code. This document describes the controlled testnet path first. Real-money settlement remains disabled until founder approval, legal review, deployment verification, and production security gates are complete.

## Current Components

Backend repository: `C:\gcsc-smart-contractor`

- API server: `v3/pure-server.js`
- PostgreSQL tables: `escrow_contracts`, `milestones`, `milestone_chain_txs`, `audit_events`
- Existing chain tx endpoints:
  - `POST /api/milestones/:id/chain-txs`
  - `POST /api/milestones/:id/chain-txs/:txId/verify`
- Existing Hyperion verifier:
  - `XPR_TESTNET_HYPERION_URLS`
  - `XPR_TX_VERIFIER_ENABLED`
  - `XPR_TX_VERIFIER_INTERVAL_MS`

Frontend repository: `C:\gcsc-store`

- WebAuth wallet service: `src/services/webauth.ts`
- XPR settlement service: `src/services/xprSettlement.ts`
- Dashboard signing UI: `src/pages/Dashboard.tsx`
- API client methods:
  - `recordMilestoneChainTx`
  - `verifyMilestoneChainTx`

Contracts repository:

- Expected local path: `C:\gcsc-website`
- Current state on this machine: not present.
- Contract inspection and contract build work are blocked until the repo is restored or cloned locally.

## Accounts And Network

Testnet chain id:

```text
71ee83bcf52142d61019d95f9cc5427ba6a0d7ff8accd9e2088ae2abeaf3d3dd
```

Escrow contract account:

```text
gcscrow1111
```

Frontend environment variables:

```text
VITE_XPR_TESTNET_CHAIN_ID
VITE_XPR_TESTNET_RPC_URL
VITE_GCSC_ESCROW_CONTRACT
```

Backend environment variables:

```text
XPR_TESTNET_HYPERION_URLS
XPR_TX_VERIFIER_ENABLED
XPR_TX_VERIFIER_INTERVAL_MS
```

## Layer 1 Backend State Flow

1. Homeowner creates a project.
2. Verified contractor submits a bid.
3. Homeowner accepts the bid.
4. Backend `acceptStoredBid` marks the accepted bid as `accepted`.
5. Backend rejects competing bids for the same project.
6. Backend creates `escrow_contracts` row:
   - `project_id`
   - `homeowner_id`
   - `contractor_id`
   - `total_amount`
   - `status = pending`
7. Backend marks the project as `in_progress`.
8. Backend records audit event `bid.accepted` with `project_id`, `contractor_id`, `escrow_id`, and amount.

The backend escrow record is the product-layer coordination object. It does not prove funds are on-chain by itself.

## Layer 2 On-Chain Funding Flow

The smart contract funding flow must use the project id as the transfer memo.

Transfer memo format:

```text
<project_id>
```

Example:

```text
42
```

Funding requirements:

- Sender must be the homeowner account expected by the on-chain escrow.
- Receiver must be the escrow contract account or the token transfer route used by `gcscrow1111`.
- Memo must match the escrow `project_id` string.
- Amount must match the expected funded amount for the escrow.
- Funding the same escrow twice must fail at the contract or backend evidence layer.

Backend production state must not mark an escrow as funded unless an on-chain funding transaction has been verified against the expected contract, actor, action, memo, amount, and chain id.

## Milestone Backend Flow

Milestones are created under an accepted escrow.

Create milestone:

```http
POST /api/escrow/:id/milestones
```

Rules:

- User must be authenticated.
- User must be the homeowner.
- Escrow must not be `disputed`.
- Escrow must not be `completed`.
- Milestone amount must be greater than zero.
- Total milestone amount must not exceed escrow `total_amount`.

Submit milestone:

```http
POST /api/milestones/:id/submit
```

Rules:

- User must be authenticated.
- User must be the contractor.
- Escrow must not be `disputed`.
- Milestone status must be `pending`.
- Backend status becomes `submitted`.

Approve milestone:

```http
POST /api/milestones/:id/approve
```

Rules:

- User must be authenticated.
- User must be the homeowner.
- Escrow must not be `disputed`.
- Milestone status must be `submitted`.
- Backend status becomes `approved`.

Release milestone:

```http
POST /api/milestones/:id/release
```

Rules:

- User must be authenticated.
- User must be the homeowner.
- Escrow must not be `disputed`.
- Milestone status must be `approved`.
- Backend status becomes `released`.
- If released milestone total is greater than or equal to escrow `total_amount`, backend escrow becomes `completed`.

Dispute milestone:

```http
POST /api/milestones/:id/dispute
```

Rules:

- User must be authenticated.
- User must be homeowner or contractor.
- Released milestone cannot be disputed.
- Milestone status becomes `disputed`.
- Escrow status becomes `disputed`.

## WebAuth Signed Action Flow

Frontend uses `@proton/web-sdk` through `connectWebAuthSession`.

Signing sequence:

1. User opens Dashboard.
2. User connects WebAuth wallet.
3. Dashboard determines allowed milestone action by role and milestone status.
4. Dashboard calls `signEscrowMilestoneAction`.
5. `signEscrowMilestoneAction` opens WebAuth signing for XPR testnet.
6. WebAuth signs and broadcasts a transaction.
7. Frontend extracts transaction id from the WebAuth response.
8. Frontend records transaction evidence through backend `recordMilestoneChainTx`.
9. Backend stores the transaction with `status = broadcast`.
10. User or background verifier calls verification endpoint.
11. Backend verifies transaction through Hyperion.
12. Backend updates transaction status to `confirmed` or `failed`.

Supported on-chain milestone actions:

```text
submitms
approvems
releasems
disputems
```

Action payloads:

```json
{
  "escrow_id": 123,
  "milestone_id": 456
}
```

For `submitms` only:

```json
{
  "escrow_id": 123,
  "milestone_id": 456,
  "evidence_hash": "contractor-provided-evidence-hash"
}
```

Recorded backend evidence payload:

```json
{
  "action": "approvems",
  "tx_id": "xpr-testnet-transaction-id",
  "chain_id": "71ee83bcf52142d61019d95f9cc5427ba6a0d7ff8accd9e2088ae2abeaf3d3dd",
  "contract_account": "gcscrow1111",
  "actor": "xpraccount",
  "status": "broadcast"
}
```

## Chain Transaction Verification

Current backend behavior:

- `tx_id` is stored in `milestone_chain_txs`.
- `contract_account` must be `gcscrow1111`.
- Action must be one of the supported milestone actions.
- Role guard controls who can record each action.
- Hyperion fetches `/v2/history/get_transaction?id=<tx_id>`.
- Current verifier confirms whether the transaction contains `gcscrow1111::<action>`.

Required hardening before pilot settlement:

- Reject duplicate `tx_id` instead of updating a previous record.
- Confirm `chain_id` equals the expected testnet chain id.
- Confirm `actor` equals the wallet account that signed the action.
- Confirm the action authorization actor matches the backend user role.
- Confirm action data contains the expected `escrow_id`.
- Confirm action data contains the expected `milestone_id`.
- Confirm `submitms` evidence hash matches the recorded submission.
- Confirm release action is not accepted unless backend milestone is approved.
- Confirm dispute action is not accepted after release.
- Record audit event when a transaction is recorded.
- Record audit event when a transaction is confirmed or failed.

## Audit Event Mapping

Existing event:

```text
bid.accepted
```

Required settlement events:

```text
escrow.chain_tx.recorded
escrow.chain_tx.confirmed
escrow.chain_tx.failed
escrow.milestone.submitted
escrow.milestone.approved
escrow.milestone.released
escrow.milestone.disputed
escrow.funding.recorded
escrow.funding.confirmed
escrow.funding.failed
```

Required metadata fields:

```json
{
  "escrow_id": 123,
  "milestone_id": 456,
  "project_id": 42,
  "action": "releasems",
  "tx_id": "xpr-testnet-transaction-id",
  "chain_id": "71ee83bcf52142d61019d95f9cc5427ba6a0d7ff8accd9e2088ae2abeaf3d3dd",
  "contract_account": "gcscrow1111",
  "actor": "xpraccount",
  "verification_status": "confirmed"
}
```

## Failure States

Wallet and signing:

- User cancels WebAuth connection.
- User cancels WebAuth signing.
- WebAuth returns no transaction id.
- WebAuth returns a wallet account that does not match the expected user wallet profile.

Backend authorization:

- User is unauthenticated.
- User is not a participant in the escrow.
- Contractor tries to approve or release.
- Homeowner tries to submit contractor work.
- Non-participant tries to dispute.

Escrow and milestone state:

- Escrow is disputed.
- Escrow is completed.
- Milestone is not pending when submit is requested.
- Milestone is not submitted when approve is requested.
- Milestone is not approved when release is requested.
- Released milestone is disputed.
- Release would exceed funded amount.

Chain transaction:

- Duplicate transaction id.
- Transaction id format invalid.
- Transaction not found on Hyperion.
- Transaction exists but does not include expected contract action.
- Transaction action uses wrong contract account.
- Transaction action uses wrong chain id.
- Transaction action actor does not match stored actor.
- Transaction action data does not match escrow id.
- Transaction action data does not match milestone id.
- Funding transaction memo does not match project id.
- Funding amount does not match expected amount.

Operations:

- `C:\gcsc-website` is missing locally.
- Contract build has not been verified in this environment.
- Contract deployment and permissions are not verified.
- Founder admin account is not created yet.

## Test Plan

Backend tests:

1. Recording a milestone chain transaction creates `status = broadcast`.
2. Recording an invalid action returns 400.
3. Recording a wrong contract account returns 400.
4. Recording an action by the wrong escrow role returns 403.
5. Recording duplicate `tx_id` returns 409.
6. Hyperion verification marks a matching transaction as `confirmed`.
7. Hyperion verification marks a non-matching transaction as `failed`.
8. Hyperion verification marks a missing transaction as `failed`.
9. Confirmed verification writes audit event `escrow.chain_tx.confirmed`.
10. Failed verification writes audit event `escrow.chain_tx.failed`.

Frontend validators:

1. WebAuth signing UI is visible only in escrow milestone context.
2. Signing buttons map to allowed milestone role and status.
3. Dashboard records only a transaction id returned from WebAuth.
4. Dashboard shows pending, confirmed, and failed transaction states.
5. Dashboard links recorded testnet transactions to the XPR testnet explorer.
6. Wallet cancellation shows an error state and does not record a transaction.

Contract tests after `C:\gcsc-website` is available:

1. Create escrow project successfully.
2. Fund escrow via token transfer with `project_id` as memo.
3. Add milestone to funded escrow.
4. Contractor submits milestone as complete.
5. Owner approves milestone and contractor receives payment.
6. Owner disputes milestone and escrow status becomes disputed.
7. Funding same escrow twice fails.
8. Releasing milestone without owner approval fails.

## Pilot Gate

The XPR/WebAuth escrow settlement path is not pilot-ready until all of these are true:

- Contracts repository is present locally.
- `contracts/gcsc-core` build passes.
- Escrow contract tests pass.
- Backend duplicate tx rejection passes.
- Backend verification audit events pass.
- Frontend signing validator passes.
- A testnet escrow transaction is signed through WebAuth and recorded in backend.
- Hyperion confirms the recorded transaction.
- Founder explicitly approves any real token or fund movement.
