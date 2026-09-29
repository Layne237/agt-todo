/**
 * GET /api/vapid-public-key
 * Tells the app whether background push is configured and which public key to subscribe with.
 */
const { env, isConfigured, maxDelayDays, sendJson } = require('./_utils');

module.exports = (req, res) => {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
    if (!isConfigured()) return sendJson(res, 503, { configured: false });
    sendJson(res, 200, {
        configured: true,
        publicKey: env('VAPID_PUBLIC_KEY'),
        maxDelayDays: maxDelayDays()
    });
};
