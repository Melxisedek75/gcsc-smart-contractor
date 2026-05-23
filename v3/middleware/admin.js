/**
 * ============================================================================
 * GCSC Admin Role Middleware
 * ============================================================================
 *
 * Backward-compatible export surface for admin and role guards.
 * The JWT/session verification lives in ./auth so every protected endpoint
 * uses the same verified authentication flow.
 * ============================================================================
 */

const {
    extractUser,
    requireAuth,
    requireAdmin,
    requireRole,
    requireEscrowParty,
} = require('./auth');

module.exports = {
    extractUser,
    requireAuth,
    requireAdmin,
    requireRole,
    requireEscrowParty,
};
