// =============================================================
// Smart ContractOR | BACKEND SERVER (Node.js)
// GCSC — Global Construction Smart Contract
// Network: XPR Network (Proton) — secp256k1
// =============================================================
// CHANGELOG:
//   v1.0 — mock key generation (Math.random, hardcoded PEM)
//   v2.0 — REAL secp256k1 keypair (WIF + EOS pubkey format)
//           + AES-256-GCM encryption before Google Drive upload
//           + no private key ever sent by email
//   v2.1 — FIXED Google Drive OAuth2 (auto-refresh token)
//           + CORS support for frontend
//           + startup env validation
//           + frontend connected (no more mock)
//   v3.0 — Vergent AI Verification Layer
//           + /api/verify/scope  — Verify→Discover→Prove for AI scopes
//           + /api/verify/bid    — market rate validation + risk discovery
//           + /api/verify/contractor — on-chain trust score + audit trail
// =============================================================

const express    = require('express');
const cors       = require('cors');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const crypto     = require('crypto');   // built-in Node.js — no extra install
const { Readable } = require('stream');
const { verifyBid, verifyScope, verifyContractor } = require('./vergent-verify');
const { createEscrow, submitMilestone, approveMilestone, raiseDispute, getEscrow, listEscrows } = require('./escrow-engine');
require('dotenv').config();

// =============================================================
// STARTUP: CHECK REQUIRED ENVIRONMENT VARIABLES
// =============================================================

const REQUIRED_ENV = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REFRESH_TOKEN',
    'SYSTEM_EMAIL',
    'EMAIL_PASSWORD',
    'ENCRYPTION_SECRET',
];

const missingVars = REQUIRED_ENV.filter(v => !process.env[v]);
if (missingVars.length > 0) {
    console.error('\n[GCSC] ❌  MISSING ENVIRONMENT VARIABLES:');
    missingVars.forEach(v => console.error(`         → ${v}`));
    console.error('\n[GCSC] Create a .env file at this folder and fill in the values.');
    console.error('[GCSC] See .env.example for the template.\n');
    process.exit(1);
}

if (process.env.ENCRYPTION_SECRET.length < 32) {
    console.error('[GCSC] ❌  ENCRYPTION_SECRET must be at least 32 characters long.');
    console.error('         Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
}

const app = express();

// Allow any origin (the HTML file opens from file:// or localhost)
app.use(cors());
app.use(express.json());
app.use(express.static('./')); // Serve static files (HTML, CSS, JS)

// =============================================================
// SECTION 1: XPR NETWORK KEYPAIR GENERATION
// secp256k1 — same curve used by XPR Network / EOS / Bitcoin
// Output:
//   wifPrivateKey  — 52-char WIF string (starts with K or L)
//   xprPublicKey   — 53-char EOS-format string (starts with EOS)
// =============================================================

const BASE58_CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(buf) {
    let num = BigInt('0x' + buf.toString('hex'));
    let result = '';
    while (num > 0n) {
        result = BASE58_CHARS[Number(num % 58n)] + result;
        num /= 58n;
    }
    // preserve leading zero bytes
    for (let i = 0; i < buf.length && buf[i] === 0; i++) {
        result = '1' + result;
    }
    return result;
}

function doubleSha256(buf) {
    const first  = crypto.createHash('sha256').update(buf).digest();
    return crypto.createHash('sha256').update(first).digest();
}

function generateXPRKeyPair() {
    // 1. Generate raw secp256k1 keypair
    const { privateKey: privDer, publicKey: pubDer } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'secp256k1',
        publicKeyEncoding:  { type: 'spki',  format: 'der' },
        privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    });

    // 2. Extract raw 32-byte private key via JWK
    const privObj     = crypto.createPrivateKey({ key: privDer, format: 'der', type: 'pkcs8' });
    const privJwk     = privObj.export({ format: 'jwk' });
    const privBytes   = Buffer.from(privJwk.d, 'base64url');  // 32 bytes

    // 3. Build WIF (Wallet Import Format) — standard for EOS / XPR
    //    structure: 0x80 + privKey(32) + 0x01(compressed) + checksum(4)
    const wifPayload  = Buffer.concat([Buffer.from([0x80]), privBytes, Buffer.from([0x01])]);
    const wifChecksum = doubleSha256(wifPayload).slice(0, 4);
    const wifPrivateKey = base58Encode(Buffer.concat([wifPayload, wifChecksum]));

    // 4. Extract compressed public key (33 bytes: 02/03 prefix + 32-byte X)
    const pubObj      = crypto.createPublicKey({ key: pubDer, format: 'der', type: 'spki' });
    const pubJwk      = pubObj.export({ format: 'jwk' });
    const x           = Buffer.from(pubJwk.x, 'base64url');
    const y           = Buffer.from(pubJwk.y, 'base64url');
    const prefix      = (y[y.length - 1] % 2 === 0) ? 0x02 : 0x03;
    const compPub     = Buffer.concat([Buffer.from([prefix]), x]);  // 33 bytes

    // 5. Build EOS/XPR public key: "EOS" + Base58(compPub + RIPEMD160 checksum(4))
    const pubChecksum   = crypto.createHash('ripemd160').update(compPub).digest().slice(0, 4);
    const xprPublicKey  = 'EOS' + base58Encode(Buffer.concat([compPub, pubChecksum]));

    return { wifPrivateKey, xprPublicKey };
}

// Generate a valid XPR / EOSIO account name (12 chars: a-z + 1-5)
function generateXPRAccountName() {
    const chars      = 'abcdefghijklmnopqrstuvwxyz12345';
    const randBytes  = crypto.randomBytes(8);
    let suffix = '';
    for (let i = 0; i < 8; i++) suffix += chars[randBytes[i] % chars.length];
    return 'gcsc' + suffix; // e.g. "gcscab1c23de"
}

// =============================================================
// SECTION 2: AES-256-GCM ENCRYPTION
// Private key is NEVER stored in plain text.
// Encrypted with key derived from ENCRYPTION_SECRET (.env).
// Decryption requires the server secret — Google Drive alone
// is not enough to recover the key.
// =============================================================

function encryptPrivateKey(wifKey) {
    const secret = process.env.ENCRYPTION_SECRET;

    const salt       = crypto.randomBytes(16);
    // PBKDF2: 100 000 iterations, 256-bit derived key
    const derivedKey = crypto.pbkdf2Sync(secret, salt, 100_000, 32, 'sha256');

    const iv         = crypto.randomBytes(12);   // 96-bit IV for GCM
    const cipher     = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
    const encrypted  = Buffer.concat([cipher.update(wifKey, 'utf8'), cipher.final()]);
    const authTag    = cipher.getAuthTag();       // 128-bit authentication tag

    return JSON.stringify({
        algorithm:   'AES-256-GCM',
        kdf:         'PBKDF2-SHA256-100000',
        salt:        salt.toString('hex'),
        iv:          iv.toString('hex'),
        authTag:     authTag.toString('hex'),
        data:        encrypted.toString('hex'),
        generatedAt: new Date().toISOString(),
        note:        'Encrypted XPR private key. Requires ENCRYPTION_SECRET from server to decrypt.',
    }, null, 2);
}

// =============================================================
// SECTION 3: GOOGLE DRIVE CLIENT (OAuth2 with auto-refresh)
// ---
// FIX v2.1: Previously used raw GOOGLE_TOKEN string which broke.
// Now uses OAuth2Client with client_id + client_secret + refresh_token.
// The refresh_token never expires (unless revoked), so the server
// stays authenticated indefinitely without manual token rotation.
// =============================================================

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'       // redirect URI for desktop / server apps
);

oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const drive = google.drive({
    version: 'v3',
    auth: oauth2Client,
});

// =============================================================
// SECTION 4: EMAIL CLIENT (Gmail SMTP + App Password)
// =============================================================

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.SYSTEM_EMAIL,
        pass: process.env.EMAIL_PASSWORD,
    },
});

// =============================================================
// SECTION 5: REGISTRATION ENDPOINT
// POST /api/register  { email, role }
// =============================================================

app.post('/api/register', async (req, res) => {
    const { email, role } = req.body;

    if (!email || !role) {
        return res.status(400).json({ error: '"email" and "role" are required.' });
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email address.' });
    }

    console.log(`[GCSC] Registration started: ${email} | role: ${role}`);

    // Check if using REAL or MOCK credentials
    const isRealCredentials = !process.env.GOOGLE_CLIENT_ID.includes('123456789') &&
                             !process.env.GOOGLE_CLIENT_ID.includes('abcdefg');
    const testMode = !isRealCredentials;

    if (testMode) {
        console.log('[GCSC] ⚠️  TEST MODE: Using mock credentials. Skipping Google Drive & Email.');
    }

    try {
        // STEP A — Generate real XPR keypair
        const { wifPrivateKey, xprPublicKey } = generateXPRKeyPair();
        const xprAccount = generateXPRAccountName();
        console.log(`[GCSC] Keypair generated — account: ${xprAccount}`);

        // STEP B — Encrypt private key before any storage
        const encryptedJson = encryptPrivateKey(wifPrivateKey);

        // STEP C & D — Google Drive operations (SKIP IN TEST MODE)
        let driveStatus = 'Skipped (test mode)';
        if (!testMode) {
            try {
                // Create a dedicated vault folder on Google Drive
                const folderRes = await drive.files.create({
                    requestBody: {
                        name:     `GCSC_Vault_${xprAccount}`,
                        mimeType: 'application/vnd.google-apps.folder',
                    },
                    fields: 'id',
                });
                const folderId = folderRes.data.id;
                console.log(`[GCSC] Drive vault folder created: ${folderId}`);

                // Upload the ENCRYPTED key file (not plaintext)
                await drive.files.create({
                    requestBody: {
                        name:        `${xprAccount}_key.enc.json`,
                        parents:     [folderId],
                        description: 'AES-256-GCM encrypted XPR private key',
                    },
                    media: {
                        mimeType: 'application/json',
                        body:     Readable.from([encryptedJson]),
                    },
                    fields: 'id',
                });
                console.log(`[GCSC] Encrypted key uploaded to Drive.`);
                driveStatus = 'Uploaded to Google Drive';
            } catch (driveErr) {
                console.error('[GCSC] Google Drive error:', driveErr.message);
                throw driveErr;
            }
        }

        // STEP E — Welcome email (SKIP IN TEST MODE)
        if (!testMode) {
            try {
                await transporter.sendMail({
                    from:    `"GCSC Smart ContractOR" <${process.env.SYSTEM_EMAIL}>`,
                    to:      email,
                    subject: 'Welcome to GCSC — Your XPR Wallet is Ready',
                    html: `
                    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a2e">
                      <h1 style="color:#4361ee">Welcome to GCSC!</h1>
                      <p>You have been registered as a <strong>${role}</strong> on the XPR Network.</p>

                      <div style="background:#f0f4ff;border-left:4px solid #4361ee;padding:16px;margin:20px 0;border-radius:4px">
                        <h3 style="margin:0 0 10px">Your XPR Wallet</h3>
                        <p style="margin:4px 0"><strong>Account:</strong>
                          <code style="background:#e8eeff;padding:2px 6px;border-radius:3px">${xprAccount}</code>
                        </p>
                        <p style="margin:4px 0"><strong>Public Key:</strong>
                          <code style="word-break:break-all;font-size:12px">${xprPublicKey}</code>
                        </p>
                      </div>

                      <div style="background:#fff8e1;border-left:4px solid #ffc107;padding:16px;margin:20px 0;border-radius:4px">
                        <h3 style="margin:0 0 8px">⚠ Security Notice</h3>
                        <ul style="margin:0;padding-left:18px">
                          <li>Your private key has been <strong>encrypted with AES-256-GCM</strong>.</li>
                          <li>The encrypted file is stored in your Google Drive vault:
                            <em>GCSC_Vault_${xprAccount}</em>.</li>
                          <li><strong>Never share your private key with anyone.</strong></li>
                        </ul>
                      </div>

                      <p style="color:#888;font-size:12px">
                        GCSC Smart ContractOR — XPR Network (Proton) — Testnet
                      </p>
                    </div>`,
                });
                console.log(`[GCSC] Welcome email sent to: ${email}`);
            } catch (emailErr) {
                console.error('[GCSC] Email error:', emailErr.message);
                throw emailErr;
            }
        } else {
            console.log(`[GCSC] Email skipped (test mode). Would send to: ${email}`);
        }

        // Return only public information — never return the private key
        return res.status(200).json({
            success:   true,
            account:   xprAccount,
            publicKey: xprPublicKey,
            message:   testMode
                ? 'Registration complete (TEST MODE - no Google Drive/Email).'
                : 'Registration complete. Encrypted key stored on Google Drive.',
            driveStatus: driveStatus,
            testMode:   testMode,
        });

    } catch (err) {
        console.error('[GCSC] Registration error:', err.message);
        return res.status(500).json({ error: 'Registration failed. Check server logs.', detail: err.message });
    }
});

// =============================================================
// GOOGLE OAUTH TOKEN HELPER (для получения refresh token)
// GET /api/get-google-token — перенаправляет на авторизацию Google
// GET /auth/google/callback — обрабатывает callback и показывает refresh token
// =============================================================

// Создаём отдельный OAuth2Client с localhost redirect URI для получения токенов
const oauth2ClientLocal = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'http://localhost:3000/auth/google/callback'  // localhost callback
);

// STEP 1: Пользователь открывает /api/get-google-token
app.get('/api/get-google-token', (req, res) => {
    // Генерируем URL для авторизации с доступом к Google Drive
    const authUrl = oauth2ClientLocal.generateAuthUrl({
        access_type: 'offline',  // ВАЖНО: offline - чтобы получить refresh_token
        scope: ['https://www.googleapis.com/auth/drive'],
        prompt: 'consent',  // Заставляет Google показать окно согласия
    });

    res.send(`
        <html>
            <body style="font-family: Arial; margin: 40px; background: #f5f5f5;">
                <h2>🔐 GCSC Smart ContractOR — Google Authorization</h2>
                <p>Кликните ниже, чтобы авторизоваться в Google и получить refresh token:</p>
                <p>
                    <a href="${authUrl}" style="
                        display: inline-block;
                        background: #4285F4;
                        color: white;
                        padding: 12px 24px;
                        text-decoration: none;
                        border-radius: 5px;
                        font-weight: bold;
                    ">
                        Авторизоваться через Google
                    </a>
                </p>
                <p style="color: #666; font-size: 12px;">
                    После авторизации вы получите refresh token, который нужно скопировать в .env файл.
                </p>
            </body>
        </html>
    `);
});

// STEP 2: Google перенаправляет пользователя сюда с кодом авторизации
app.get('/auth/google/callback', async (req, res) => {
    const code = req.query.code;
    const error = req.query.error;

    if (error) {
        return res.send(`
            <html>
                <body style="font-family: Arial; margin: 40px; background: #ffebee;">
                    <h2>❌ Ошибка авторизации</h2>
                    <p>${error}</p>
                    <p><a href="/api/get-google-token">Попробовать снова</a></p>
                </body>
            </html>
        `);
    }

    if (!code) {
        return res.send(`
            <html>
                <body style="font-family: Arial; margin: 40px; background: #ffebee;">
                    <h2>❌ Код авторизации не получен</h2>
                    <p><a href="/api/get-google-token">Попробовать снова</a></p>
                </body>
            </html>
        `);
    }

    try {
        // Обмениваем код на access и refresh tokens
        const { tokens } = await oauth2ClientLocal.getToken(code);

        const refreshToken = tokens.refresh_token;
        const accessToken = tokens.access_token;

        if (!refreshToken) {
            return res.send(`
                <html>
                    <body style="font-family: Arial; margin: 40px; background: #fff3cd;">
                        <h2>⚠️ Внимание</h2>
                        <p>Refresh token не получен. Это может быть потому что:</p>
                        <ul>
                            <li>Вы уже авторизовались раньше с теми же credentials</li>
                            <li>Нужно отозвать старые токены</li>
                        </ul>
                        <p><a href="https://myaccount.google.com/permissions" target="_blank">Управлять доступом приложений</a></p>
                        <p><a href="/api/get-google-token">Попробовать снова</a></p>
                    </body>
                </html>
            `);
        }

        // Показываем refresh token пользователю
        return res.send(`
            <html>
                <body style="font-family: Arial; margin: 40px; background: #e8f5e9;">
                    <h2>✅ Успешно!</h2>
                    <p><strong>Ваш Google Refresh Token:</strong></p>
                    <div style="
                        background: white;
                        border: 1px solid #4CAF50;
                        border-radius: 5px;
                        padding: 16px;
                        margin: 20px 0;
                        word-break: break-all;
                        font-family: monospace;
                        font-size: 12px;
                    ">
                        ${refreshToken}
                    </div>
                    <p><strong>Инструкции:</strong></p>
                    <ol>
                        <li>Скопируйте token выше</li>
                        <li>Откройте файл <code>.env</code> в вашей папке</li>
                        <li>Найдите строку: <code>GOOGLE_REFRESH_TOKEN=...</code></li>
                        <li>Замените старое значение на скопированный token</li>
                        <li>Сохраните файл</li>
                        <li>Перезагрузите backend: <code>npm start</code></li>
                    </ol>
                    <hr>
                    <p style="color: #666; font-size: 12px;">
                        ⚠️ Этот token очень важен! Никому его не показывайте.
                    </p>
                </body>
            </html>
        `);

    } catch (err) {
        console.error('[GCSC] Token exchange error:', err.message);
        return res.send(`
            <html>
                <body style="font-family: Arial; margin: 40px; background: #ffebee;">
                    <h2>❌ Ошибка при получении токена</h2>
                    <p>${err.message}</p>
                    <p><a href="/api/get-google-token">Попробовать снова</a></p>
                </body>
            </html>
        `);
    }
});

// =============================================================
// SECTION 6: VERGENT AI VERIFICATION LAYER (v3.0)
// Implements: Verify → Discover → Prove pipeline
// Inspired by Vergent AI's "Trusted AI" approach
// Every answer includes an auditable proof chain.
// =============================================================

// POST /api/verify/scope
// Body: { items: string[], category: string, projectDescription: string }
app.post('/api/verify/scope', (req, res) => {
    const { items, category, projectDescription } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: '"items" must be a non-empty array of scope strings.' });
    }
    if (!category) {
        return res.status(400).json({ error: '"category" is required.' });
    }

    console.log(`[GCSC Verify] Scope verification: category=${category}, items=${items.length}`);
    const result = verifyScope({ items, category, projectDescription: projectDescription || '' });
    return res.status(200).json(result);
});

// POST /api/verify/bid
// Body: { contractorName, stakeAmount, bidAmount, category, location }
app.post('/api/verify/bid', (req, res) => {
    const { contractorName, stakeAmount, bidAmount, category, location } = req.body;

    if (!bidAmount || !category) {
        return res.status(400).json({ error: '"bidAmount" and "category" are required.' });
    }

    const parsedBid   = parseFloat(bidAmount);
    const parsedStake = parseFloat(stakeAmount) || 0;

    if (isNaN(parsedBid) || parsedBid <= 0) {
        return res.status(400).json({ error: '"bidAmount" must be a positive number.' });
    }

    console.log(`[GCSC Verify] Bid verification: ${contractorName || 'anonymous'} — $${parsedBid} — ${category}`);
    const result = verifyBid({
        contractorName: contractorName || 'Anonymous',
        stakeAmount:    parsedStake,
        bidAmount:      parsedBid,
        category,
        location:       location || '',
    });
    return res.status(200).json(result);
});

// POST /api/verify/contractor
// Body: { name: string, stakeAmount: number }
app.post('/api/verify/contractor', (req, res) => {
    const { name, stakeAmount } = req.body;

    if (!name) {
        return res.status(400).json({ error: '"name" is required.' });
    }

    console.log(`[GCSC Verify] Contractor verification: ${name} — stake=${stakeAmount}`);
    const result = verifyContractor({ name, stakeAmount: stakeAmount || 0 });
    return res.status(200).json(result);
});

// =============================================================
// SECTION 7: ESCROW SMART CONTRACT ENGINE (v3.0)
// All financial actions are AI-gated — no money moves without
// a TRUSTED verdict from the Vergent verification layer.
// Anti-manipulation: no skipping milestones, identity checks,
// dispute freezes all payments, AI arbitration on disputes.
// =============================================================

// POST /api/escrow/create
// Body: { customerEmail, contractorName, contractorStake, category,
//         location, totalAmount, scopeItems[], projectDescription }
app.post('/api/escrow/create', (req, res) => {
    const { customerEmail, contractorName, contractorStake,
            category, location, totalAmount, scopeItems, projectDescription } = req.body;

    if (!customerEmail || !contractorName || !category || !totalAmount) {
        return res.status(400).json({ error: 'customerEmail, contractorName, category and totalAmount are required.' });
    }
    const amount = parseFloat(totalAmount);
    if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: 'totalAmount must be a positive number.' });
    }

    console.log(`[GCSC Escrow] Creating: ${customerEmail} → ${contractorName} | $${amount} | ${category}`);
    const result = createEscrow({
        customerEmail, contractorName,
        contractorStake: parseFloat(contractorStake) || 0,
        category, location: location || '',
        totalAmount: amount,
        scopeItems: scopeItems || [],
        projectDescription: projectDescription || '',
    });

    if (!result.success && result.blocked) {
        console.warn(`[GCSC Escrow] BLOCKED: AI score ${result.combinedScore}/100`);
        return res.status(403).json(result);
    }

    console.log(`[GCSC Escrow] Created: ${result.escrowId} | Score: ${result.verification.combinedScore}/100`);
    return res.status(201).json(result);
});

// POST /api/escrow/:id/submit-milestone
// Body: { milestoneId, contractorName, evidence[] }
app.post('/api/escrow/:id/submit-milestone', (req, res) => {
    const { milestoneId, contractorName, evidence } = req.body;
    if (!milestoneId || !contractorName) {
        return res.status(400).json({ error: 'milestoneId and contractorName are required.' });
    }
    console.log(`[GCSC Escrow] Milestone ${milestoneId} submitted for ${req.params.id} by ${contractorName}`);
    const result = submitMilestone(req.params.id, parseInt(milestoneId), contractorName, evidence || []);
    return result.success ? res.status(200).json(result) : res.status(400).json(result);
});

// POST /api/escrow/:id/approve-milestone
// Body: { milestoneId, customerEmail }
app.post('/api/escrow/:id/approve-milestone', (req, res) => {
    const { milestoneId, customerEmail } = req.body;
    if (!milestoneId || !customerEmail) {
        return res.status(400).json({ error: 'milestoneId and customerEmail are required.' });
    }
    console.log(`[GCSC Escrow] Milestone ${milestoneId} approval for ${req.params.id} by ${customerEmail}`);
    const result = approveMilestone(req.params.id, parseInt(milestoneId), customerEmail);
    if (!result.success && result.blocked) return res.status(403).json(result);
    return result.success ? res.status(200).json(result) : res.status(400).json(result);
});

// POST /api/escrow/:id/dispute
// Body: { raisedBy, reason, evidence[] }
app.post('/api/escrow/:id/dispute', (req, res) => {
    const { raisedBy, reason, evidence } = req.body;
    if (!raisedBy || !reason) {
        return res.status(400).json({ error: 'raisedBy and reason are required.' });
    }
    console.log(`[GCSC Escrow] DISPUTE raised for ${req.params.id} by ${raisedBy}`);
    const result = raiseDispute(req.params.id, raisedBy, reason, evidence || []);
    return result.success ? res.status(200).json(result) : res.status(400).json(result);
});

// GET /api/escrow/:id
app.get('/api/escrow/:id', (req, res) => {
    const escrow = getEscrow(req.params.id);
    if (!escrow) return res.status(404).json({ error: 'Escrow not found.' });
    return res.status(200).json(escrow);
});

// GET /api/escrow
app.get('/api/escrow', (_req, res) => {
    return res.status(200).json(listEscrows());
});

// =============================================================
// HEALTH CHECK
// =============================================================

app.get('/health', (_req, res) =>
    res.json({ status: 'ok', version: '3.0', network: 'XPR Network (Proton)', verification: 'Vergent-Inspired Verify→Discover→Prove' })
);

// =============================================================
// START SERVER
// =============================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n[GCSC] ✅  Backend v3.0 running on http://localhost:${PORT}`);
    console.log(`[GCSC]     Network  : XPR Network (Proton)`);
    console.log(`[GCSC]     Drive    : OAuth2 (auto-refresh)`);
    console.log(`[GCSC]     Email    : ${process.env.SYSTEM_EMAIL}`);
    console.log(`[GCSC]     Verify   : Vergent-Inspired Verify→Discover→Prove`);
    console.log(`[GCSC]       → POST /api/verify/scope`);
    console.log(`[GCSC]       → POST /api/verify/bid`);
    console.log(`[GCSC]       → POST /api/verify/contractor`);
    console.log(`[GCSC]     Escrow   : AI-Gated Smart Contract Engine`);
    console.log(`[GCSC]       → POST /api/escrow/create`);
    console.log(`[GCSC]       → POST /api/escrow/:id/submit-milestone`);
    console.log(`[GCSC]       → POST /api/escrow/:id/approve-milestone`);
    console.log(`[GCSC]       → POST /api/escrow/:id/dispute`);
    console.log(`[GCSC]       → GET  /api/escrow/:id`);
    console.log(`[GCSC]     Health   : http://localhost:${PORT}/health\n`);
});
