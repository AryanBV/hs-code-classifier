/* Read-only DB connection probe. Reports connection STRUCTURE + result only.
 * NEVER prints the password. Used to diagnose the ingest auth failure safely. */
require('dotenv').config();
const { Client } = require('pg');

async function probe(key) {
  const raw = process.env[key];
  if (!raw) { console.log(`${key}: NOT SET`); return; }

  let u = null;
  try { u = new URL(raw); } catch { /* pg may still parse it */ }
  if (u) {
    const pwd = u.password || '';
    const decoded = (() => { try { return decodeURIComponent(pwd); } catch { return pwd; } })();
    const hasUnsafe = /[^A-Za-z0-9._~%-]/.test(pwd);          // raw, as written in the URL
    const encodingLooksOff = decoded !== pwd && /%[0-9A-Fa-f]{2}/.test(pwd) === false;
    console.log(`${key}: user=${u.username} host=${u.hostname} port=${u.port || '(default)'} db=${u.pathname.slice(1)} pwd_len=${pwd.length} pwd_raw_has_special_chars=${hasUnsafe}`);
  } else {
    console.log(`${key}: (URL not parseable by WHATWG URL; pg will try its own parser)`);
  }

  const c = new Client({ connectionString: raw, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
  try {
    await c.connect();
    const r = await c.query('SELECT version()');
    console.log(`   CONNECT OK -> ${String(r.rows[0].version).slice(0, 45)}...`);
    await c.end();
  } catch (e) {
    console.log(`   CONNECT FAIL -> code=${e.code || '(none)'} | ${String(e.message).split('\n')[0]}`);
    try { await c.end(); } catch {}
  }
}

(async () => {
  for (const key of ['DATABASE_URL', 'DIRECT_URL']) await probe(key);
})();
