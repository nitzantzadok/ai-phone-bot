/**
 * שרת HTTP לניהול הסטודיו — ללא תלויות חיצוניות.
 *
 * העוטף הזה עושה שלושה דברים בלבד: קורא את גוף הבקשה, מעביר אותה לטבלת
 * הנתיבים המשותפת (api.js), ומגיש את מסך המאמן הבנוי. כל ההיגיון — הרשאות,
 * מסד, מנוע — יושב מאחורי ה-API, ולכן אותה התנהגות בדיוק רצה גם בפריסה
 * לקצה, בלי גרסה שנייה שצריך לתחזק.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Db } from '../store/db.js';
import { ALL_ROUTES, PUBLIC, isSecureRequest, resolveAccount, setDb } from './api.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(HERE, '../web');
const DIST_DIR = path.resolve(HERE, '../../dist');

const db = setDb(new Db());

const json = (res, code, body, headers = {}) => {
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    // התשובות אישיות לחשבון — אין להן מה להישמר במטמון של דפדפן או פרוקסי
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(body, null, 2));
};

const readBody = (req) => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', (c) => {
    raw += c;
    if (raw.length > 2_000_000) { reject(new Error('גוף בקשה גדול מדי')); req.destroy(); }
  });
  req.on('end', () => {
    if (!raw) return resolve({});
    try { resolve(JSON.parse(raw)); } catch { reject(new Error('JSON לא תקין')); }
  });
  req.on('error', reject);
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const key = `${req.method} ${url.pathname}`;

  try {
    if (ALL_ROUTES[key]) {
      const resolved = resolveAccount(req.headers.cookie);
      const ctx = {
        account: resolved?.account || null,
        token: resolved?.token || null,
        secure: isSecureRequest(req.headers['x-forwarded-proto']),
        setCookie: null,
      };

      // שער אחד לכל ה-API: בלי מושב תקף, שום נתיב נתונים לא נפתח
      if (!PUBLIC.has(key) && !ctx.account) {
        return json(res, 401, { error: 'נדרשת התחברות', login: true });
      }

      const body = req.method === 'POST' ? await readBody(req) : {};
      const payload = await ALL_ROUTES[key](body, url, ctx);
      const headers = ctx.setCookie ? { 'set-cookie': ctx.setCookie } : {};
      return json(res, 200, payload, headers);
    }
    if (url.pathname === '/api/program' && req.method === 'GET') {
      const resolved = resolveAccount(req.headers.cookie);
      if (!resolved) return json(res, 401, { error: 'נדרשת התחברות', login: true });
      const p = db.getProgram(url.searchParams.get('id'));
      if (!p || !db.ownsTrainee(resolved.account.id, p.traineeId)) {
        return json(res, 404, { error: 'תכנית לא נמצאה' });
      }
      return json(res, 200, p);
    }
    // קבצים סטטיים: מסך המאמן הבנוי, ואחריו קבצי המקור
    const file = url.pathname === '/' ? 'app.html' : path.basename(url.pathname);
    const candidates = [path.join(DIST_DIR, file), path.join(WEB_DIR, file)];
    const full = candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
    if (!full && url.pathname === '/') {
      return json(res, 503, { error: 'מסך המאמן טרם נבנה. הרץ: npm run build' });
    }
    if (full) {
      const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
      res.writeHead(200, { 'content-type': types[path.extname(full)] || 'application/octet-stream' });
      return res.end(fs.readFileSync(full));
    }
    return json(res, 404, { error: 'לא נמצא' });
  } catch (err) {
    return json(res, err.status || 400, { error: err.message });
  }
});

const PORT = process.env.PORT || 4310;
if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, () => console.log(`מערכת תכניות האימון פועלת: http://localhost:${PORT}`));
}

export { server, db };
