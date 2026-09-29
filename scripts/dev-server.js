/**
 * Local development server - no Vercel or Upstash account needed.
 *
 *   npm install
 *   npm run dev          → http://localhost:3000
 *
 * - Serves the static site (localhost counts as a secure context, so service
 *   workers and Web Push work).
 * - Runs the real /api/* handlers.
 * - Emulates Upstash QStash in memory: /api/schedule publishes to this server,
 *   which calls /api/fire (with a valid signature) when the alarm time comes.
 * - Generates VAPID keys once into .dev-vapid.json (git-ignored).
 *
 * Push messages still travel through the browser's real push service
 * (FCM for Chrome, Mozilla autopush for Firefox), so you need internet access.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const webpush = require('web-push');

const ROOT = path.join(__dirname, '..');
const PORT = parseInt(process.env.PORT || '3000', 10);
const ORIGIN = `http://localhost:${PORT}`;
const SIGNING_KEY = 'dev-signing-key';

// ---------- Environment for the API handlers ----------

const vapidFile = path.join(ROOT, '.dev-vapid.json');
if (!fs.existsSync(vapidFile)) fs.writeFileSync(vapidFile, JSON.stringify(webpush.generateVAPIDKeys(), null, 2));
const vapid = JSON.parse(fs.readFileSync(vapidFile, 'utf8'));

Object.assign(process.env, {
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || vapid.publicKey,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || vapid.privateKey,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT || 'mailto:dev@localhost',
    QSTASH_URL: `${ORIGIN}/__qstash`,
    QSTASH_TOKEN: 'dev-token',
    QSTASH_CURRENT_SIGNING_KEY: SIGNING_KEY,
    QSTASH_NEXT_SIGNING_KEY: '',
    APP_URL: ORIGIN
});

const API_ROUTES = {
    '/api/vapid-public-key': require('../api/vapid-public-key'),
    '/api/schedule': require('../api/schedule'),
    '/api/cancel': require('../api/cancel'),
    '/api/fire': require('../api/fire')
};

// ---------- QStash emulator ----------

const pendingMessages = new Map(); // messageId -> timeout

function base64url(buffer) {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signQStash(destination, body) {
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
    const claims = base64url(Buffer.from(JSON.stringify({
        iss: 'Upstash', sub: destination, iat: now, nbf: now, exp: now + 300,
        jti: crypto.randomUUID(), body: base64url(crypto.createHash('sha256').update(body).digest())
    })));
    const signature = base64url(crypto.createHmac('sha256', SIGNING_KEY).update(`${header}.${claims}`).digest());
    return `${header}.${claims}.${signature}`;
}

async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8');
}

async function handleQStash(req, res, pathname) {
    const publishPrefix = '/__qstash/v2/publish/';
    if (req.method === 'POST' && pathname.startsWith(publishPrefix)) {
        const destination = decodeURIComponent(req.url.slice(req.url.indexOf(publishPrefix) + publishPrefix.length));
        const body = await readBody(req);
        const notBefore = parseInt(req.headers['upstash-not-before'] || '0', 10) * 1000;
        const messageId = 'msg_dev_' + crypto.randomBytes(8).toString('hex');
        const delay = Math.max(0, notBefore - Date.now());
        pendingMessages.set(messageId, setTimeout(async () => {
            pendingMessages.delete(messageId);
            try {
                const r = await fetch(destination, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Upstash-Signature': signQStash(destination, body) },
                    body: body
                });
                console.log(`[qstash] delivered ${messageId} → ${r.status}`);
            } catch (err) {
                console.log(`[qstash] delivery failed ${messageId}: ${err.message}`);
            }
        }, delay));
        console.log(`[qstash] scheduled ${messageId} in ${Math.round(delay / 1000)}s`);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ messageId }));
    }

    const cancelMatch = pathname.match(/^\/__qstash\/v2\/messages\/(.+)$/);
    if (req.method === 'DELETE' && cancelMatch) {
        const id = decodeURIComponent(cancelMatch[1]);
        const timer = pendingMessages.get(id);
        if (!timer) {
            res.writeHead(404);
            return res.end();
        }
        clearTimeout(timer);
        pendingMessages.delete(id);
        console.log(`[qstash] cancelled ${id}`);
        res.writeHead(202);
        return res.end();
    }

    if (req.method === 'GET' && pathname === '/__qstash/pending') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify([...pendingMessages.keys()]));
    }

    res.writeHead(404);
    res.end();
}

// ---------- Static files ----------

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function serveStatic(req, res, pathname) {
    let filePath = path.normalize(path.join(ROOT, decodeURIComponent(pathname)));
    const blocked = ['node_modules', '.git', '.dev-vapid.json', 'agt_todo_mobile'];
    if (!filePath.startsWith(ROOT) || blocked.some(b => filePath.includes(path.join(ROOT, b)))) {
        res.writeHead(403);
        return res.end();
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
    if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Not found');
    }
    const headers = { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' };
    if (pathname === '/service-worker.js') headers['Service-Worker-Allowed'] = '/';
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
}

// ---------- Server ----------

http.createServer(async (req, res) => {
    const pathname = new URL(req.url, ORIGIN).pathname;
    try {
        if (pathname.startsWith('/__qstash/')) return await handleQStash(req, res, pathname);
        if (API_ROUTES[pathname]) {
            req.headers['x-forwarded-host'] = req.headers.host;
            return await API_ROUTES[pathname](req, res);
        }
        serveStatic(req, res, pathname);
    } catch (err) {
        console.error(err);
        if (!res.headersSent) res.writeHead(500);
        res.end();
    }
}).listen(PORT, () => {
    console.log(`AGT Todo dev server → ${ORIGIN}`);
    console.log('QStash is emulated locally; pushes go through your browser\'s real push service.');
});
