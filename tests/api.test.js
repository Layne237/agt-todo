/**
 * Tests for the push API helpers (QStash signature verification, input validation).
 * Run: npm test
 */
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

process.env.QSTASH_CURRENT_SIGNING_KEY = 'current-key';
process.env.QSTASH_NEXT_SIGNING_KEY = 'next-key';
const { verifyQStashSignature, isValidSubscription, isSameOrigin } = require('../api/_utils');

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function sign(body, key, claimsOverride) {
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
    const claims = b64url(Buffer.from(JSON.stringify(Object.assign({
        iss: 'Upstash', sub: 'https://x/api/fire', iat: now, nbf: now, exp: now + 300,
        body: b64url(crypto.createHash('sha256').update(body).digest())
    }, claimsOverride))));
    const sig = b64url(crypto.createHmac('sha256', key).update(`${header}.${claims}`).digest());
    return `${header}.${claims}.${sig}`;
}

const body = JSON.stringify({ subscription: { endpoint: 'https://push.example/1' }, payload: { taskId: 'a' } });

test('accepts a valid signature from the current or next key', () => {
    assert.strictEqual(verifyQStashSignature(sign(body, 'current-key'), body), true);
    assert.strictEqual(verifyQStashSignature(sign(body, 'next-key'), body), true);
});

test('rejects wrong key, tampered body, expired token, and garbage', () => {
    assert.strictEqual(verifyQStashSignature(sign(body, 'wrong-key'), body), false);
    assert.strictEqual(verifyQStashSignature(sign(body, 'current-key'), body + ' '), false);
    assert.strictEqual(verifyQStashSignature(sign(body, 'current-key', { exp: 1 }), body), false);
    assert.strictEqual(verifyQStashSignature(sign(body, 'current-key', { iss: 'Evil' }), body), false);
    assert.strictEqual(verifyQStashSignature('not.a.jwt', body), false);
    assert.strictEqual(verifyQStashSignature(undefined, body), false);
});

test('validates push subscriptions', () => {
    const good = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BPx', auth: 'xyz' } };
    assert.strictEqual(isValidSubscription(good), true);
    assert.strictEqual(isValidSubscription({ ...good, endpoint: 'http://insecure' }), false);
    assert.strictEqual(isValidSubscription({ endpoint: good.endpoint }), false);
    assert.strictEqual(isValidSubscription(null), false);
});

test('same-origin check', () => {
    assert.strictEqual(isSameOrigin({ headers: { host: 'agt-todo.vercel.app' } }), true);
    assert.strictEqual(isSameOrigin({ headers: { host: 'agt-todo.vercel.app', origin: 'https://agt-todo.vercel.app' } }), true);
    assert.strictEqual(isSameOrigin({ headers: { host: 'agt-todo.vercel.app', origin: 'https://evil.example' } }), false);
});
