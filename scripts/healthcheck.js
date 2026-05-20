#!/usr/bin/env node
/**
 * ============================================================================
 * GCSC Backend Health Check Script
 * ============================================================================
 *
 * Run: node scripts/healthcheck.js
 *
 * Checks:
 *   - Backend URL connectivity
 *   - API endpoints response
 *   - Database connectivity (via API)
 *   - Critical endpoint availability
 *
 * Exit codes:
 *   0 — All healthy
 *   1 — Some endpoints degraded
 *   2 — Critical failure
 * ============================================================================
 */

const https = require('https');
const http = require('http');

const BACKEND_URL = process.env.GCSC_BACKEND_URL || 'https://gcsc-backend.onrender.com';
const TIMEOUT_MS = 10000;

// Endpoints to check
const HEALTH_CHECKS = [
    { path: '/health', method: 'GET', critical: true, expect: [200] },
    { path: '/api/projects', method: 'GET', critical: false, expect: [200, 401] },
    { path: '/api/bids', method: 'GET', critical: false, expect: [200, 401] },
    { path: '/api/escrow', method: 'GET', critical: false, expect: [200, 401, 404] },
    { path: '/api/xpr/health', method: 'GET', critical: false, expect: [200, 404] },
];

function makeRequest(url, path, method) {
    return new Promise((resolve) => {
        const client = url.startsWith('https:') ? https : http;
        const options = {
            hostname: new URL(url).hostname,
            port: new URL(url).port || (url.startsWith('https:') ? 443 : 80),
            path,
            method,
            timeout: TIMEOUT_MS,
        };

        const req = client.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    ok: res.statusCode >= 200 && res.statusCode < 500,
                    error: res.statusCode >= 500 ? `Server error ${res.statusCode}` : null,
                });
            });
        });

        req.on('error', (err) => {
            resolve({ status: 0, ok: false, error: err.message });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({ status: 0, ok: false, error: 'Timeout' });
        });

        req.end();
    });
}

async function runHealthCheck() {
    console.log(`🔍 GCSC Backend Health Check`);
    console.log(`   URL: ${BACKEND_URL}`);
    console.log(`   Time: ${new Date().toISOString()}`);
    console.log();

    let criticalFailures = 0;
    let totalFailures = 0;

    for (const check of HEALTH_CHECKS) {
        process.stdout.write(`   Checking ${check.method} ${check.path} ... `);
        
        const result = await makeRequest(BACKEND_URL, check.path, check.method);
        
        if (result.ok) {
            console.log(`✅ ${result.status}`);
        } else {
            console.log(`❌ ${result.error || result.status}`);
            totalFailures++;
            if (check.critical) criticalFailures++;
        }
    }

    console.log();
    
    if (criticalFailures > 0) {
        console.log(`🔴 CRITICAL: ${criticalFailures} critical endpoint(s) down`);
        console.log(`   Backend needs immediate attention!`);
        process.exit(2);
    } else if (totalFailures > 0) {
        console.log(`🟡 WARNING: ${totalFailures} endpoint(s) degraded`);
        process.exit(1);
    } else {
        console.log(`🟢 HEALTHY: All endpoints responding`);
        process.exit(0);
    }
}

runHealthCheck();
