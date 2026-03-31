// ============================================================
// Утилита: Получение Google OAuth2 Refresh Token
// ============================================================
// Запусти ОДИН РАЗ после настройки client_id и client_secret:
//   node get-google-token.js
//
// Она откроет ссылку в браузере, ты авторизуешься,
// скопируешь код — и получишь refresh_token для .env
// ============================================================

require('dotenv').config();
const { google } = require('googleapis');
const readline   = require('readline');

const clientId     = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || clientId.includes('REPLACE') ||
    !clientSecret || clientSecret.includes('REPLACE')) {
    console.error('\n❌  Сначала заполни GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET в .env\n');
    process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'urn:ietf:wg:oauth:2.0:oob'  // для десктопных / серверных приложений
);

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',   // offline = получаем refresh_token
    scope:       SCOPES,
    prompt:      'consent',   // consent = гарантированно вернёт refresh_token
});

console.log('\n══════════════════════════════════════════════════════');
console.log('  GCSC — Google OAuth2 Token Setup');
console.log('══════════════════════════════════════════════════════');
console.log('\n1. Открой эту ссылку в браузере:\n');
console.log('   ' + authUrl);
console.log('\n2. Войди в свой Google аккаунт и нажми "Разрешить"');
console.log('3. Google покажет код вида: 4/0AX... — скопируй его\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Вставь код сюда: ', async (code) => {
    rl.close();
    try {
        const { tokens } = await oauth2Client.getToken(code.trim());
        console.log('\n✅  Успех! Твои токены:\n');
        console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
        console.log('\n══════════════════════════════════════════════════════');
        console.log('Скопируй строку GOOGLE_REFRESH_TOKEN=... в свой .env файл');
        console.log('══════════════════════════════════════════════════════\n');
    } catch (err) {
        console.error('\n❌  Ошибка при обмене кода:', err.message);
        console.error('Попробуй снова — код одноразовый.\n');
    }
});
