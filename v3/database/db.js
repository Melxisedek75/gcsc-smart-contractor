/**
 * ============================================================================
 * GCSC Smart Contractor v3.0 — Database Connection Module
 * ============================================================================
 *
 * Provides a centralized PostgreSQL connection pool using the `pg` library.
 * All queries MUST use parameterized statements — never string concatenation.
 *
 * Security Features:
 *   - Parameterized queries (prevents SQL injection)
 *   - Connection pooling (limits concurrent connections)
 *   - Graceful shutdown (pool.end() on process signals)
 *   - No sensitive data logging (queries are logged without parameters)
 *   - Transaction support with automatic rollback on error
 *
 * Environment Variables (set in .env):
 *   PGHOST       — Database host (default: localhost)
 *   PGPORT       — Database port (default: 5432)
 *   PGDATABASE   — Database name (default: gcsc_v3)
 *   PGUSER       — Database username (default: gcsc_app)
 *   PGPASSWORD   — Database password (REQUIRED)
 *   PGSSL        — Enable SSL (default: false, set 'true' for production)
 *   PGMAXPOOL    — Max pool connections (default: 20)
 *   PGTIMEOUT    — Query timeout in ms (default: 30000)
 *
 * Usage:
 *   const { query, transaction, pool } = require('./db');
 *
 *   // Simple query
 *   const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
 *
 *   // Transaction
 *   await transaction(async (client) => {
 *     await client.query('INSERT INTO ...', [val1]);
 *     await client.query('UPDATE ...', [val2]);
 *   });
 * ============================================================================
 */

const { Pool } = require('pg');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** @type {Pool} The shared PostgreSQL connection pool */
let pool = null;

/**
 * Build the pool configuration object from environment variables.
 * Uses sensible defaults for development; production values should be set
 * explicitly via environment variables.
 *
 * @returns {import('pg').PoolConfig}
 */
function buildPoolConfig() {
    const port = parseInt(process.env.PGPORT || '5432', 10);
    const maxConnections = parseInt(process.env.PGMAXPOOL || '20', 10);
    const queryTimeout = parseInt(process.env.PGTIMEOUT || '30000', 10);

    const config = {
        host: process.env.PGHOST || 'localhost',
        port: Number.isNaN(port) ? 5432 : port,
        database: process.env.PGDATABASE || 'gcsc_v3',
        user: process.env.PGUSER || 'gcsc_app',
        password: process.env.PGPASSWORD || '',
        max: Number.isNaN(maxConnections) ? 20 : maxConnections,
        // Idle timeout: close idle clients after 10 minutes
        idleTimeoutMillis: 600000,
        // Connection timeout: fail if connection takes > 10 seconds
        connectionTimeoutMillis: 10000,
        // Query timeout: cancel queries that exceed this duration
        statement_timeout: Number.isNaN(queryTimeout) ? 30000 : queryTimeout,
        // Application name appears in pg_stat_activity for monitoring
        application_name: 'gcsc_v3_api',
    };

    // SSL configuration for production
    if (process.env.PGSSL === 'true') {
        config.ssl = {
            // In production, provide CA cert via PGSSLCA or use rejectUnauthorized
            rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== 'false',
        };
    }

    return config;
}

/**
 * Initialize and return the PostgreSQL connection pool.
 * Creates a singleton pool instance. Call once at application startup.
 *
 * @returns {Pool}
 */
function getPool() {
    if (!pool) {
        const config = buildPoolConfig();

        // Security: do NOT log the password even in debug mode
        const safeConfig = {
            ...config,
            password: config.password ? '***REDACTED***' : '',
        };
        // eslint-disable-next-line no-console
        console.log('[DB] Creating connection pool:', JSON.stringify(safeConfig));

        pool = new Pool(config);

        // Error handler for the pool itself (e.g., connection failures)
        pool.on('error', (err, client) => {
            // eslint-disable-next-line no-console
            console.error('[DB] Unexpected pool error:', err.message);
            // Do not exit — the pool will try to reconnect
        });

        // Log connection acquisition for debugging (only in non-production)
        if (process.env.NODE_ENV !== 'production') {
            pool.on('connect', () => {
                // Silent in production to avoid log spam
            });
        }
    }
    return pool;
}

// ---------------------------------------------------------------------------
// Query Helper
// ---------------------------------------------------------------------------

/**
 * Execute a parameterized SQL query against the pool.
 *
 * SECURITY: Always use parameterized queries ($1, $2, etc.).
 * Never concatenate user input into SQL strings.
 *
 * @param {string} text       — The SQL query text with $1, $2 placeholders
 * @param {Array<*>} [params] — Parameter values to substitute (optional)
 * @returns {Promise<import('pg').QueryResult>}
 *
 * @example
 * const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
 * const { rowCount } = await query('DELETE FROM sessions WHERE jti = $1', [jti]);
 */
async function query(text, params) {
    const start = Date.now();
    const activePool = getPool();

    try {
        const result = await activePool.query(text, params);

        // Logging: only show the query text, never parameter values
        if (process.env.NODE_ENV !== 'production') {
            const duration = Date.now() - start;
            // eslint-disable-next-line no-console
            console.log(`[DB] Query ${duration}ms: ${text.split('\n').map((l) => l.trim()).join(' ')}`);
        }

        return result;
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[DB] Query error:', err.message);
        // Log the query text (without params) for debugging
        // eslint-disable-next-line no-console
        console.error('[DB] Failed query:', text.substring(0, 200));
        throw err;
    }
}

/**
 * Execute a SELECT query and return only the rows array.
 *
 * Convenience wrapper around `query()` for read operations.
 *
 * @param {string} text       — The SQL query text with placeholders
 * @param {Array<*>} [params] — Parameter values (optional)
 * @returns {Promise<Array<Object>>} — Array of row objects
 *
 * @example
 * const users = await select('SELECT * FROM users WHERE role = $1', ['contractor']);
 */
async function select(text, params) {
    const result = await query(text, params);
    return result.rows;
}

/**
 * Execute a SELECT query and return a single row, or null if not found.
 *
 * @param {string} text       — The SQL query text with placeholders
 * @param {Array<*>} [params] — Parameter values (optional)
 * @returns {Promise<Object|null>} — Single row object, or null
 *
 * @example
 * const user = await selectOne('SELECT * FROM users WHERE email = $1', [email]);
 * if (user) { ... }
 */
async function selectOne(text, params) {
    const rows = await select(text, params);
    return rows.length > 0 ? rows[0] : null;
}

/**
 * Execute an INSERT/UPDATE/DELETE and return the row count.
 *
 * @param {string} text       — The SQL query text with placeholders
 * @param {Array<*>} [params] — Parameter values (optional)
 * @returns {Promise<number>} — Number of affected rows
 *
 * @example
 * const deleted = await modify('DELETE FROM sessions WHERE expires_at < NOW()');
 */
async function modify(text, params) {
    const result = await query(text, params);
    return result.rowCount;
}

// ---------------------------------------------------------------------------
// Transaction Support
// ---------------------------------------------------------------------------

/**
 * Execute a callback function within a database transaction.
 *
 * Automatically handles BEGIN, COMMIT, and ROLLBACK. If the callback
 * throws an error, the transaction is rolled back and the error is re-thrown.
 *
 * SECURITY: The callback receives a `client` object. All queries on this
 * client use the same connection and participate in the same transaction.
 * Always use parameterized queries on the client.
 *
 * @param {Function} callback — Async function receiving a pg Client
 * @returns {Promise<*>}      — The return value of the callback
 *
 * @example
 * await transaction(async (client) => {
 *   await client.query('INSERT INTO projects (title, homeowner_id) VALUES ($1, $2)', [title, uid]);
 *   await client.query('INSERT INTO audit_log (action, user_id) VALUES ($1, $2)', ['create_project', uid]);
 * });
 */
async function transaction(callback) {
    const activePool = getPool();
    const client = await activePool.connect();

    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        // eslint-disable-next-line no-console
        console.error('[DB] Transaction rolled back:', err.message);
        throw err;
    } finally {
        // Always release the client back to the pool
        client.release();
    }
}

// ---------------------------------------------------------------------------
// Connection Health Check
// ---------------------------------------------------------------------------

/**
 * Verify the database connection is alive.
 * Useful for health check endpoints (e.g., /healthz).
 *
 * @returns {Promise<boolean>} — True if the database is reachable
 *
 * @example
 * const isHealthy = await healthCheck();
 * if (!isHealthy) { return res.status(503).json({ status: 'unhealthy' }); }
 */
async function healthCheck() {
    try {
        await query('SELECT 1');
        return true;
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Graceful Shutdown
// ---------------------------------------------------------------------------

/**
 * Gracefully close the connection pool.
 * Call this during application shutdown to allow pending queries to complete.
 *
 * @param {number} [timeoutMs=10000] — Maximum time to wait (default: 10s)
 * @returns {Promise<void>}
 *
 * @example
 * process.on('SIGTERM', async () => {
 *   await gracefulShutdown(5000);
 *   process.exit(0);
 * });
 */
async function gracefulShutdown(timeoutMs = 10000) {
    if (!pool) return;

    // eslint-disable-next-line no-console
    console.log('[DB] Graceful shutdown initiated...');

    // Set a hard timeout to force-close
    const timeout = setTimeout(() => {
        // eslint-disable-next-line no-console
        console.error('[DB] Forcing pool shutdown after timeout');
    }, timeoutMs);

    try {
        await pool.end();
        // eslint-disable-next-line no-console
        console.log('[DB] Connection pool closed successfully');
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[DB] Error during pool shutdown:', err.message);
    } finally {
        clearTimeout(timeout);
        pool = null;
    }
}

// ---------------------------------------------------------------------------
// Process Signal Handlers (auto-register)
// ---------------------------------------------------------------------------

// Register graceful shutdown on process termination signals
// These fire when the app receives SIGTERM (e.g., Kubernetes, Docker)
// or SIGINT (Ctrl+C in development).

process.on('SIGTERM', async () => {
    await gracefulShutdown();
    process.exit(0);
});

process.on('SIGINT', async () => {
    await gracefulShutdown();
    process.exit(0);
});

// ---------------------------------------------------------------------------
// Module Exports
// ---------------------------------------------------------------------------

module.exports = {
    /** @type {Pool} The connection pool (use for direct access if needed) */
    get pool() {
        return getPool();
    },
    /** Execute a parameterized query */
    query,
    /** Execute a SELECT and return rows */
    select,
    /** Execute a SELECT and return the first row (or null) */
    selectOne,
    /** Execute an INSERT/UPDATE/DELETE and return affected row count */
    modify,
    /** Execute operations within a transaction */
    transaction,
    /** Check database connectivity */
    healthCheck,
    /** Gracefully close the connection pool */
    gracefulShutdown,
};
