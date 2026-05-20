/**
 * ============================================================================
 * GCSC Shared Error Handler (LOW-1 Fix)
 * ============================================================================
 * Sanitizes error responses in production:
 *   - Removes internal error details (stack traces, SQL errors)
 *   - Keeps errorId for debugging (only in non-production)
 *   - Adds consistent error format across all routes
 * ============================================================================
 */

const crypto = require('crypto');

function generateErrorId() {
    return crypto.randomBytes(6).toString('hex');
}

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Send standardized error response
 * @param {object} res - Express response object
 * @param {number} status - HTTP status code
 * @param {string} message - User-friendly error message
 * @param {Error|null} err - Internal error (logged, not exposed)
 * @param {string} errorId - Unique error ID for tracking
 */
function sendError(res, status, message, err = null, errorId = '') {
    if (err && errorId) {
        console.error(`[Error:${errorId}]`, err.message || '', err.stack || '');
    }

    const response = { error: message };

    // Only expose errorId in non-production for debugging
    if (!IS_PRODUCTION && errorId) {
        response.errorId = errorId;
    }

    // Never expose internal error details in production
    if (!IS_PRODUCTION && err && err.message) {
        response.details = err.message;
    }

    res.status(status).json(response);
}

/**
 * Express middleware for centralized error handling
 */
function errorHandler(err, req, res, next) {
    const errorId = generateErrorId();
    console.error(`[Unhandled:${errorId}]`, err.message, err.stack);

    const status = err.status || err.statusCode || 500;
    const message = IS_PRODUCTION
        ? 'An unexpected error occurred. Please try again later.'
        : (err.message || 'Internal server error');

    const response = { error: message };
    if (!IS_PRODUCTION) {
        response.errorId = errorId;
        response.stack = err.stack?.split('\n').slice(0, 5);
    }

    res.status(status).json(response);
}

module.exports = {
    generateErrorId,
    sendError,
    errorHandler,
    IS_PRODUCTION,
};
