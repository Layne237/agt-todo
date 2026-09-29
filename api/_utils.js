/**
 * Shared helpers for the push API (files starting with "_" are not routes on Vercel).
 *
 * Required environment variables (Vercel → Project → Settings → Environment Variables):
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   npx web-push generate-vapid-keys
 *   VAPID_SUBJECT                         mailto:you@example.com
 *   QSTASH_TOKEN                          Upstash console → QStash
 *   QSTASH_CURRENT_SIGNING_KEY            Upstash console → QStash → Signing keys
 *   QSTASH_NEXT_SIGNING_KEY               Upstash console → QStash → Signing keys
 * Optional:
 *   QSTASH_URL             defaults to https://qstash.upstash.io (use your region's URL if the console shows one)
 *   QSTASH_MAX_DELAY_DAYS  defaults to 7 (QStash free tier limit)
 *   APP_URL                public URL of the app, e.g. https://agt-todo.vercel.app (auto-detected otherwise)
 */

const crypto = require('crypto');

function env(name) {
    return (process.env[name] || '').trim();
}

function isConfigured() {
    return ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'QSTASH_TOKEN', 'QSTASH_CURRENT_SIGNING_KEY'].every(k => env(k));
}

function maxDelayDays() {
    const days = parseInt(env('QSTASH_MAX_DELAY_DAYS') || '7', 10);
    return days > 0 ? days : 7;
}

function qstashBase() {
    return (env('QSTASH_URL') || 'https://qstash.upstash.io').replace(/\/+$/, '');
}

function appUrl(req) {
    if (env('APP_URL')) return env('APP_URL').replace(/\/+$/, '');
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return `${proto}://${host}`;
}

function sendJson(res, status, body) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
}

/** Rejects cross-site browser calls. Requests without an Origin header (curl, QStash) are allowed. */
function isSameOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        return new URL(origin).host === host;
    } catch (e) {
        return false;
    }
}

/** Reads the raw request body (needed to verify QStash signatures byte-for-byte). */
async function readRawBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    if (chunks.length) return Buffer.concat(chunks).toString('utf8');
    // Stream already consumed by a body parser: fall back to the parsed body.
    if (typeof req.body === 'string') return req.body;
    if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
    return '';
}

async function readJson(req) {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
    const raw = await readRawBody(req);
    return raw ? JSON.parse(raw) : {};
}

function isValidSubscription(sub) {
    if (!sub || typeof sub !== 'object' || typeof sub.endpoint !== 'string') return false;
    if (sub.endpoint.length > 1000 || !sub.endpoint.startsWith('https://')) return false;
    const keys = sub.keys || {};
    return typeof keys.p256dh === 'string' && typeof keys.auth === 'string'
        && keys.p256dh.length < 200 && keys.auth.length < 100;
}

// ---------- QStash ----------

async function qstashPublish(destination, body, notBeforeSeconds) {
    const res = await fetch(`${qstashBase()}/v2/publish/${destination}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env('QSTASH_TOKEN')}`,
            'Content-Type': 'application/json',
            'Upstash-Not-Before': String(notBeforeSeconds),
            'Upstash-Retries': '2'
        },
        body: body
    });
    if (!res.ok) throw new Error(`QStash publish failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return data.messageId;
}

async function qstashCancel(messageId) {
    const res = await fetch(`${qstashBase()}/v2/messages/${encodeURIComponent(messageId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${env('QSTASH_TOKEN')}` }
    });
    // 404 = already delivered or already cancelled - that's fine.
    if (!res.ok && res.status !== 404) throw new Error(`QStash cancel failed (${res.status})`);
}

function base64url(buffer) {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Verifies the `Upstash-Signature` header: an HS256 JWT signed with one of the
 * signing keys, whose `body` claim is the base64url SHA-256 of the raw body.
 */
function verifyQStashSignature(token, rawBody) {
    if (typeof token !== 'string') return false;
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [header, payload, signature] = parts;

    const keys = [env('QSTASH_CURRENT_SIGNING_KEY'), env('QSTASH_NEXT_SIGNING_KEY')].filter(Boolean);
    const signatureOk = keys.some(key => {
        const expected = base64url(crypto.createHmac('sha256', key).update(`${header}.${payload}`).digest());
        const a = Buffer.from(expected);
        const b = Buffer.from(signature.replace(/=+$/, ''));
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    });
    if (!signatureOk) return false;

    let claims;
    try {
        claims = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    } catch (e) {
        return false;
    }
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== 'Upstash') return false;
    if (claims.exp && now > claims.exp) return false;
    if (claims.nbf && now < claims.nbf - 60) return false;

    const bodyHash = base64url(crypto.createHash('sha256').update(rawBody, 'utf8').digest());
    return String(claims.body || '').replace(/=+$/, '') === bodyHash;
}

module.exports = {
    env,
    isConfigured,
    maxDelayDays,
    appUrl,
    sendJson,
    isSameOrigin,
    readRawBody,
    readJson,
    isValidSubscription,
    qstashPublish,
    qstashCancel,
    verifyQStashSignature
};
