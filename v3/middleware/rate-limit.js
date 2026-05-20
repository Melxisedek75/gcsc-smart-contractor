/**
 * ============================================================================
 * GCSC Rate Limiting Middleware
 * ============================================================================
 *
 * Protects API endpoints from abuse:
 *   - Auth endpoints: 5 requests / 15 minutes
 *   - Financial endpoints: 10 requests / minute
 *   - General API: 100 requests / minute
 *   - Strict: 1 request / 5 seconds for critical ops
 *
 * Implementation: In-memory store (sufficient for single-instance).
 * For multi-instance: upgrade to Redis-backed store.
 * ============================================================================
 */

const crypto = require('crypto');

// In-memory rate limit store
// Structure: { key: { count, resetTime } }
const rateLimitStore = new Map();

/**
 * Clean expired entries periodically
 */
setInterval(() => {
    const now = Date.now();
    for (const [key, data] of rateLimitStore.entries()) {
        if (data.resetTime <= now) {
            rateLimitStore.delete(key);
        }
    }
}, 60000); // Clean every minute

/**
 * Generic rate limiter
 * @param {object} options - { windowMs, maxRequests, keyGenerator }
 */
function createRateLimiter(options) {
    const {
        windowMs = 60000,      // Default: 1 minute
        maxRequests = 100,     // Default: 100 requests per window
        keyGenerator = (req) => req.ip || req.connection?.remoteAddress || 'unknown',
        skipSuccessfulRequests = false,
    } = options;

    return async function rateLimitMiddleware(req, res, next) {
        const key = keyGenerator(req);
        const now = Date.now();

        let data = rateLimitStore.get(key);
        if (!data || data.resetTime <= now) {
            // New window
            data = {
                count: 1,
                resetTime: now + windowMs,
            };
            rateLimitStore.set(key, data);
        } else {
            data.count++;
        }

        // Set headers
        res.setHeader('X-RateLimit-Limit', maxRequests);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - data.count));
        res.setHeader('X-RateLimit-Reset', Math.ceil(data.resetTime / 1000));

        if (data.count > maxRequests) {
            return res.status(429).json({
                error: 'Too many requests. Please try again later.',
                retryAfter: Math.ceil((data.resetTime - now) / 1000),
            });
        }

        // Track successful requests if needed
        if (skipSuccessfulRequests) {
            const originalJson = res.json;
            res.json = function(data) {
                if (res.statusCode < 400) {
                    // Don't count successful requests
                    data.count--;
                }
                return originalJson.call(this, data);
            };
        }

        next();
    };
}

// ============================================================================
// Pre-configured limiters for different endpoint types
// ============================================================================

/** Auth endpoints (login, register, OTP) — strict */
const authLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    keyGenerator: (req) => {
        // Rate limit by IP + email if available
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        const email = req.body?.email || 'no-email';
        return `auth:${ip}:${email}`;
    },
});

/** Financial endpoints (payments, escrow funding) — very strict */
const financialLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    keyGenerator: (req) => {
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        const userId = req.user?.userId || 'anonymous';
        return `financial:${ip}:${userId}`;
    },
});

/** General API — moderate */
const generalLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    keyGenerator: (req) => {
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        return `general:${ip}`;
    },
});

/** Strict ops (password reset, account deletion) — ultra strict */
const strictLimiter = createRateLimiter({
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 1,
    keyGenerator: (req) => {
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        const userId = req.user?.userId || 'anonymous';
        return `strict:${ip}:${userId}`;
    },
});

module.exports = {
    createRateLimiter,
    authLimiter,
    financialLimiter,
    generalLimiter,
    strictLimiter,
};
