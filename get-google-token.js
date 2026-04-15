// ============================================================
// GCSC — Автоматическое получение Google OAuth2 Refresh Token
// Запусти: node get-google-token.js
//
// Что происходит автоматически:
//   1. Браузер открывается сам
//   2. Ты нажимаешь "Разрешить" — это всё что нужно от тебя
//   3. Токен перехватывается и вписывается в .env сам
//   4. Сервер готов к запуску
// ============================================================

require('dotenv').config();
const { google } = require('googleapis');
const { exec }   = require('child_process');
const http       = require('http');
const url        = require('url');
const fs         = require('fs');
const path       = require('path');

const clientId     = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const envPath      = path.join(__dirname, '.env');
const PORT         = 8080;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

if (!clientId || clientId.includes('REPLACE')) {
    console.error('\n❌  GOOGLE_CLIENT_ID не заполнен в .env\n');
    process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/gmail.send',
];

const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope:       SCOPES,
    prompt:      'consent',
});

// ── Запускаем локальный сервер для перехвата кода ─────────────
const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url, true);
    if (parsed.pathname !== '/callback') return;

    const code  = parsed.query.code;
    const error = parsed.query.error;

    if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h2>❌ Ошибка авторизации. Закрой окно и попробуй снова.</h2>');
        server.close();
        process.exit(1);
    }

    try {
        const { tokens } = await oauth2Client.getToken(code);
        const refreshToken = tokens.refresh_token;

        // ── Автоматически обновляем .env ──────────────────────
        let envContent = fs.readFileSync(envPath, 'utf8');

        if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
            // Заменяем существующую строку
            envContent = envContent.replace(
                /^GOOGLE_REFRESH_TOKEN=.*$/m,
                `GOOGLE_REFRESH_TOKEN=${refreshToken}`
            );
        } else {
            // Добавляем новую строку
            envContent += `\nGOOGLE_REFRESH_TOKEN=${refreshToken}\n`;
        }

        fs.writeFileSync(envPath, envContent, 'utf8');

        // ── Отвечаем в браузер ────────────────────────────────
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
            <!DOCTYPE html>
            <html>
            <head><meta charset="utf-8"><title>GCSC — Готово!</title></head>
            <body style="font-family:Arial;max-width:500px;margin:80px auto;text-align:center">
                <h1 style="color:#4361ee">✅ Авторизация прошла успешно!</h1>
                <p style="font-size:18px">Токен автоматически записан в <strong>.env</strong></p>
                <p style="color:#666">Можешь закрыть это окно.<br>
                В CMD запусти: <code>npm start</code></p>
            </body>
            </html>
        `);

        console.log('\n✅  Токен получен и автоматически записан в .env!');
        console.log('    Можешь закрыть браузер.');
        console.log('\n    Теперь запусти сервер:\n');
        console.log('    npm start\n');

        server.close();
    } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h2>Ошибка: ${err.message}</h2>`);
        console.error('\n❌  Ошибка:', err.message);
        server.close();
    }
});

server.listen(PORT, () => {
    console.log('\n══════════════════════════════════════════════════════');
    console.log('  GCSC — Авторизация Google (Drive + Gmail)');
    console.log('══════════════════════════════════════════════════════');
    console.log('\n  Браузер откроется автоматически...');
    console.log('  Нажми "Разрешить" — больше ничего делать не нужно.\n');

    // Открываем браузер автоматически
    exec(`start "" "${authUrl}"`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n❌  Порт ${PORT} занят. Закрой другие программы и попробуй снова.\n`);
    } else {
        console.error('\n❌  Ошибка сервера:', err.message);
    }
    process.exit(1);
});
