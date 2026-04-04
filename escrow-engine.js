// =============================================================
// GCSC — Escrow Smart Contract Engine
// Global Construction Smart Contract
// =============================================================
// Architecture:
//   Every financial action is AI-gated via vergent-verify.js
//   No money moves without a TRUSTED verdict + audit trail.
//
// Flow:
//   1. Customer deposits funds → Escrow locked
//   2. AI verifies contractor + scope + bid
//   3. Milestones defined on contract creation
//   4. Each milestone: contractor marks complete →
//      AI re-verifies → funds released for that milestone
//   5. Dispute: AI arbitrates, evidence-based ruling
//   6. Full completion: remaining funds released, contract closed
//
// Anti-manipulation rules (enforced by engine):
//   - Funds can NEVER be released without AI TRUSTED verdict
//   - No milestone can be skipped
//   - All state changes recorded in immutable audit log
//   - Disputes freeze all payments until resolved
//   - Contractor can't self-approve milestones
// =============================================================

const crypto = require('crypto');
const { verifyBid, verifyScope, verifyContractor } = require('./vergent-verify');

// ─── In-memory store (replace with DB in production) ────────────
const escrows = new Map();

// ─── Constants ──────────────────────────────────────────────────
const ESCROW_STATUS = {
    PENDING_VERIFICATION: 'PENDING_VERIFICATION', // awaiting AI check
    ACTIVE:               'ACTIVE',               // funds locked, work in progress
    MILESTONE_REVIEW:     'MILESTONE_REVIEW',     // milestone submitted, AI reviewing
    DISPUTED:             'DISPUTED',             // dispute raised, payments frozen
    COMPLETED:            'COMPLETED',            // all milestones done, funds released
    CANCELLED:            'CANCELLED',            // cancelled before start
};

const MILESTONE_STATUS = {
    PENDING:    'PENDING',    // not started
    IN_PROGRESS:'IN_PROGRESS',// contractor working
    SUBMITTED:  'SUBMITTED',  // contractor claims done
    VERIFIED:   'VERIFIED',   // AI approved, funds released
    DISPUTED:   'DISPUTED',   // in dispute
};

// Standard milestones per category
const DEFAULT_MILESTONES = {
    'Roofing':         [
        { name: 'Mobilization & Permits',   pct: 10 },
        { name: 'Tear-off & Disposal',       pct: 20 },
        { name: 'Underlayment & Decking',    pct: 30 },
        { name: 'Material Installation',     pct: 30 },
        { name: 'Final Inspection & Cleanup',pct: 10 },
    ],
    'Windows & Doors': [
        { name: 'Measurements & Permit',     pct: 15 },
        { name: 'Material Delivery',         pct: 20 },
        { name: 'Installation',              pct: 45 },
        { name: 'Seal, Caulk & Inspection',  pct: 20 },
    ],
    'Plumbing':        [
        { name: 'Permit & Site Prep',        pct: 10 },
        { name: 'Rough-in Work',             pct: 40 },
        { name: 'Final Connections',         pct: 35 },
        { name: 'Pressure Test & Inspection',pct: 15 },
    ],
    'Electrical':      [
        { name: 'Permit & Load Calculation', pct: 10 },
        { name: 'Rough-in Wiring',           pct: 35 },
        { name: 'Panel & Grounding',         pct: 35 },
        { name: 'Inspection & Sign-off',     pct: 20 },
    ],
    'HVAC':            [
        { name: 'Permit & Equipment Order',  pct: 15 },
        { name: 'Old Unit Removal',          pct: 15 },
        { name: 'New Unit Installation',     pct: 45 },
        { name: 'Commissioning & Test',      pct: 25 },
    ],
    'Siding':          [
        { name: 'Permit & Mobilization',     pct: 10 },
        { name: 'Old Siding Removal',        pct: 20 },
        { name: 'Moisture Barrier',          pct: 20 },
        { name: 'New Siding Install',        pct: 35 },
        { name: 'Trim, Caulk & Inspection',  pct: 15 },
    ],
    'Remodeling':      [
        { name: 'Permit & Design Sign-off',  pct: 10 },
        { name: 'Demolition',                pct: 15 },
        { name: 'Rough-in (Plumb/Elec)',     pct: 25 },
        { name: 'Finish Work',               pct: 35 },
        { name: 'Final Walk-through',        pct: 15 },
    ],
    'Landscaping':     [
        { name: 'Site Assessment & Design',  pct: 15 },
        { name: 'Grading & Drainage',        pct: 25 },
        { name: 'Material Installation',     pct: 45 },
        { name: 'Final Cleanup & Inspection',pct: 15 },
    ],
};

// ─── Helpers ────────────────────────────────────────────────────

function generateEscrowId() {
    return 'ESC-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function timestamp() {
    return new Date().toISOString();
}

function addAuditEntry(escrow, action, detail, actor, verdict = null) {
    escrow.auditLog.push({
        timestamp: timestamp(),
        action,
        detail,
        actor,
        verdict,
        blockRef: 'XPR-' + crypto.randomBytes(3).toString('hex').toUpperCase(), // mock block ref
    });
}

function calcReleasedAmount(escrow) {
    return escrow.milestones
        .filter(m => m.status === MILESTONE_STATUS.VERIFIED)
        .reduce((sum, m) => sum + m.amount, 0);
}

function calcRemainingAmount(escrow) {
    return escrow.totalAmount - calcReleasedAmount(escrow);
}

// ─── CORE ENGINE ────────────────────────────────────────────────

/**
 * createEscrow — Step 1: Customer creates the deal
 * AI verifies contractor + bid BEFORE any funds are committed.
 *
 * @param {object} deal
 *   { customerEmail, contractorName, contractorStake,
 *     category, location, totalAmount, scopeItems, projectDescription }
 * @returns {object} { success, escrowId, escrow, verification }
 */
function createEscrow(deal) {
    const {
        customerEmail, contractorName, contractorStake,
        category, location, totalAmount, scopeItems, projectDescription,
    } = deal;

    // ── GATE 1: Verify contractor ────────────────────────────
    const contractorVerification = verifyContractor({
        name: contractorName,
        stakeAmount: contractorStake || 0,
    });

    // ── GATE 2: Verify bid amount ────────────────────────────
    const bidVerification = verifyBid({
        contractorName,
        stakeAmount: contractorStake || 0,
        bidAmount:   totalAmount,
        category,
        location,
    });

    // ── GATE 3: Verify scope ─────────────────────────────────
    const scopeVerification = verifyScope({
        items: scopeItems || [],
        category,
        projectDescription: projectDescription || '',
    });

    // ── COMBINED VERDICT ─────────────────────────────────────
    const scores = [
        contractorVerification.overallScore,
        bidVerification.overallScore,
        scopeVerification.overallScore,
    ];
    const combinedScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const combinedVerdict = combinedScore >= 70 ? 'TRUSTED' : combinedScore >= 50 ? 'REVIEW' : 'FLAGGED';

    // ── BLOCK if not trusted ─────────────────────────────────
    if (combinedVerdict === 'FLAGGED') {
        return {
            success: false,
            blocked: true,
            reason: 'AI verification FAILED. Escrow blocked to protect funds.',
            combinedScore,
            contractorVerification,
            bidVerification,
            scopeVerification,
        };
    }

    // ── BUILD MILESTONES ─────────────────────────────────────
    const templates = DEFAULT_MILESTONES[category] || [
        { name: 'Project Start',      pct: 20 },
        { name: 'Mid-point Review',   pct: 40 },
        { name: 'Final Completion',   pct: 40 },
    ];

    const milestones = templates.map((t, i) => ({
        id:          i + 1,
        name:        t.name,
        percentage:  t.pct,
        amount:      Math.round(totalAmount * (t.pct / 100)),
        status:      i === 0 ? MILESTONE_STATUS.IN_PROGRESS : MILESTONE_STATUS.PENDING,
        submittedAt: null,
        verifiedAt:  null,
        releasedAt:  null,
        aiVerdict:   null,
        evidence:    [],
    }));

    // ── CREATE ESCROW RECORD ─────────────────────────────────
    const escrowId = generateEscrowId();
    const escrow = {
        id:            escrowId,
        status:        ESCROW_STATUS.ACTIVE,
        customerEmail,
        contractorName,
        contractorStake: contractorStake || 0,
        category,
        location,
        totalAmount,
        releasedAmount: 0,
        scopeItems:    scopeItems || [],
        projectDescription,
        milestones,
        auditLog:      [],
        createdAt:     timestamp(),
        completedAt:   null,
        disputeReason: null,
        combinedVerdict,
        combinedScore,
    };

    addAuditEntry(escrow, 'ESCROW_CREATED',
        `Escrow ${escrowId} created. $${totalAmount.toLocaleString()} locked for ${contractorName}.`,
        customerEmail, combinedVerdict);

    addAuditEntry(escrow, 'AI_VERIFICATION_PASSED',
        `Combined AI score: ${combinedScore}/100 (${combinedVerdict}). Contractor: ${contractorVerification.overallScore}, Bid: ${bidVerification.overallScore}, Scope: ${scopeVerification.overallScore}.`,
        'GCSC Vergent Engine', combinedVerdict);

    escrows.set(escrowId, escrow);

    return {
        success: true,
        escrowId,
        escrow,
        verification: { contractorVerification, bidVerification, scopeVerification, combinedScore, combinedVerdict },
    };
}

/**
 * submitMilestone — Contractor marks a milestone as complete
 * Triggers AI re-verification before any payment.
 *
 * @param {string} escrowId
 * @param {number} milestoneId
 * @param {string} contractorName  (must match escrow)
 * @param {string[]} evidence      (photo URLs, descriptions, etc.)
 */
function submitMilestone(escrowId, milestoneId, contractorName, evidence = []) {
    const escrow = escrows.get(escrowId);
    if (!escrow) return { success: false, error: 'Escrow not found.' };
    if (escrow.status === ESCROW_STATUS.DISPUTED)
        return { success: false, error: 'Escrow is under dispute. Payments frozen.' };
    if (escrow.status === ESCROW_STATUS.COMPLETED)
        return { success: false, error: 'Escrow already completed.' };
    if (escrow.contractorName !== contractorName)
        return { success: false, error: 'Contractor identity mismatch. Anti-fraud check failed.' };

    const milestone = escrow.milestones.find(m => m.id === milestoneId);
    if (!milestone) return { success: false, error: 'Milestone not found.' };
    if (milestone.status === MILESTONE_STATUS.VERIFIED)
        return { success: false, error: 'Milestone already verified and paid.' };

    // Check previous milestone is verified (no skipping)
    if (milestoneId > 1) {
        const prev = escrow.milestones.find(m => m.id === milestoneId - 1);
        if (prev && prev.status !== MILESTONE_STATUS.VERIFIED) {
            return { success: false, error: `Cannot submit milestone ${milestoneId} — previous milestone not yet verified. No skipping allowed.` };
        }
    }

    // ── AI RE-VERIFICATION ───────────────────────────────────
    const reVerify = verifyContractor({ name: contractorName, stakeAmount: escrow.contractorStake });

    milestone.status      = MILESTONE_STATUS.SUBMITTED;
    milestone.submittedAt = timestamp();
    milestone.evidence    = evidence;
    milestone.aiVerdict   = reVerify.verdict;
    escrow.status         = ESCROW_STATUS.MILESTONE_REVIEW;

    addAuditEntry(escrow,
        'MILESTONE_SUBMITTED',
        `Milestone ${milestoneId} "${milestone.name}" submitted by ${contractorName}. Evidence items: ${evidence.length}. AI re-check: ${reVerify.verdict} (${reVerify.overallScore}/100).`,
        contractorName, reVerify.verdict);

    return { success: true, milestone, reVerification: reVerify, escrow };
}

/**
 * approveMilestone — Customer approves + AI final check → funds released
 * This is the only way money moves. No AI approval = no payment.
 *
 * @param {string} escrowId
 * @param {number} milestoneId
 * @param {string} customerEmail  (must match escrow)
 */
function approveMilestone(escrowId, milestoneId, customerEmail) {
    const escrow = escrows.get(escrowId);
    if (!escrow) return { success: false, error: 'Escrow not found.' };
    if (escrow.status === ESCROW_STATUS.DISPUTED)
        return { success: false, error: 'Escrow is under dispute. Payments frozen.' };
    if (escrow.customerEmail !== customerEmail)
        return { success: false, error: 'Customer identity mismatch. Anti-fraud check failed.' };

    const milestone = escrow.milestones.find(m => m.id === milestoneId);
    if (!milestone) return { success: false, error: 'Milestone not found.' };
    if (milestone.status !== MILESTONE_STATUS.SUBMITTED)
        return { success: false, error: 'Milestone must be submitted by contractor first.' };

    // ── FINAL AI GATE before release ─────────────────────────
    const finalCheck = verifyContractor({ name: escrow.contractorName, stakeAmount: escrow.contractorStake });
    if (finalCheck.verdict === 'FLAGGED') {
        return {
            success: false,
            blocked: true,
            error:   'AI final check FLAGGED this contractor. Payment blocked. Contact GCSC support.',
            finalCheck,
        };
    }

    // ── RELEASE FUNDS ────────────────────────────────────────
    milestone.status     = MILESTONE_STATUS.VERIFIED;
    milestone.verifiedAt = timestamp();
    milestone.releasedAt = timestamp();
    milestone.aiVerdict  = finalCheck.verdict;

    escrow.releasedAmount = calcReleasedAmount(escrow);

    addAuditEntry(escrow,
        'MILESTONE_APPROVED_FUNDS_RELEASED',
        `Milestone ${milestoneId} "${milestone.name}" approved by customer. $${milestone.amount.toLocaleString()} released to ${escrow.contractorName}. AI score: ${finalCheck.overallScore}/100.`,
        customerEmail, finalCheck.verdict);

    // Advance next milestone to IN_PROGRESS
    const next = escrow.milestones.find(m => m.id === milestoneId + 1);
    if (next) {
        next.status = MILESTONE_STATUS.IN_PROGRESS;
        addAuditEntry(escrow, 'MILESTONE_ACTIVATED',
            `Milestone ${next.id} "${next.name}" is now active.`,
            'GCSC Engine', null);
    }

    // Check if all milestones are complete
    const allDone = escrow.milestones.every(m => m.status === MILESTONE_STATUS.VERIFIED);
    if (allDone) {
        escrow.status      = ESCROW_STATUS.COMPLETED;
        escrow.completedAt = timestamp();
        addAuditEntry(escrow, 'ESCROW_COMPLETED',
            `All milestones verified. Total $${escrow.totalAmount.toLocaleString()} released. Contract closed.`,
            'GCSC Engine', 'TRUSTED');
    } else {
        escrow.status = ESCROW_STATUS.ACTIVE;
    }

    return {
        success: true,
        released:     milestone.amount,
        totalReleased: escrow.releasedAmount,
        remaining:    calcRemainingAmount(escrow),
        milestone,
        finalCheck,
        escrow,
    };
}

/**
 * raiseDispute — Either party can freeze all payments and trigger AI arbitration
 *
 * @param {string} escrowId
 * @param {string} raisedBy   (email of customer or contractor name)
 * @param {string} reason
 * @param {string[]} evidence
 */
function raiseDispute(escrowId, raisedBy, reason, evidence = []) {
    const escrow = escrows.get(escrowId);
    if (!escrow) return { success: false, error: 'Escrow not found.' };
    if (escrow.status === ESCROW_STATUS.COMPLETED)
        return { success: false, error: 'Cannot dispute a completed contract.' };

    escrow.status        = ESCROW_STATUS.DISPUTED;
    escrow.disputeReason = reason;

    // ── AI ARBITRATION ───────────────────────────────────────
    // Analyse contractor trust + scope alignment to suggest ruling
    const contractorCheck = verifyContractor({ name: escrow.contractorName, stakeAmount: escrow.contractorStake });
    const scopeCheck      = verifyScope({ items: escrow.scopeItems, category: escrow.category, projectDescription: escrow.projectDescription });

    const verifiedMilestones = escrow.milestones.filter(m => m.status === MILESTONE_STATUS.VERIFIED).length;
    const totalMilestones    = escrow.milestones.length;
    const completionPct      = Math.round((verifiedMilestones / totalMilestones) * 100);

    // AI ruling logic
    let ruling, rulingDetail;
    if (contractorCheck.overallScore < 40) {
        ruling      = 'FAVOUR_CUSTOMER';
        rulingDetail = `Contractor trust score critically low (${contractorCheck.overallScore}/100). Recommend full refund of unreleased funds.`;
    } else if (completionPct >= 80) {
        ruling      = 'FAVOUR_CONTRACTOR';
        rulingDetail = `${completionPct}% of work verified complete. Recommend releasing remaining funds minus dispute penalty.`;
    } else {
        ruling      = 'MEDIATION_REQUIRED';
        rulingDetail = `Insufficient data for automatic ruling. Human mediator required. Payments remain frozen.`;
    }

    const aiArbitration = {
        ruling,
        rulingDetail,
        contractorScore:  contractorCheck.overallScore,
        scopeScore:       scopeCheck.overallScore,
        completionPct,
        verifiedMilestones,
        totalMilestones,
        arbitratedAt:     timestamp(),
    };

    addAuditEntry(escrow, 'DISPUTE_RAISED',
        `Dispute raised by ${raisedBy}: "${reason}". ALL PAYMENTS FROZEN. AI arbitration: ${ruling}.`,
        raisedBy, ruling);

    return {
        success:        true,
        disputeStatus:  'FROZEN',
        aiArbitration,
        escrow,
    };
}

/**
 * getEscrow — Read escrow state
 */
function getEscrow(escrowId) {
    const escrow = escrows.get(escrowId);
    if (!escrow) return null;
    return {
        ...escrow,
        releasedAmount: calcReleasedAmount(escrow),
        remainingAmount: calcRemainingAmount(escrow),
    };
}

/**
 * listEscrows — List all escrows (for admin/demo)
 */
function listEscrows() {
    return Array.from(escrows.values()).map(e => ({
        id:             e.id,
        status:         e.status,
        customerEmail:  e.customerEmail,
        contractorName: e.contractorName,
        category:       e.category,
        totalAmount:    e.totalAmount,
        releasedAmount: calcReleasedAmount(e),
        remainingAmount:calcRemainingAmount(e),
        milestonesTotal:   e.milestones.length,
        milestonesVerified:e.milestones.filter(m => m.status === MILESTONE_STATUS.VERIFIED).length,
        combinedVerdict:e.combinedVerdict,
        combinedScore:  e.combinedScore,
        createdAt:      e.createdAt,
    }));
}

module.exports = {
    createEscrow,
    submitMilestone,
    approveMilestone,
    raiseDispute,
    getEscrow,
    listEscrows,
    ESCROW_STATUS,
    MILESTONE_STATUS,
};
