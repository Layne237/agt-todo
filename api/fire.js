/**
 * POST /api/fire  (called by Upstash QStash at the alarm time - never by browsers)
 * Verifies the QStash signature, then sends an encrypted Web Push to the device.
 * The service worker on the device turns it into the alarm notification.
 */
const webpush = require('web-push');
const { env, isConfigured, sendJson, readRawBody, isValidSubscription, verifyQStashSignature } = require('./_utils');

// Hours the push service keeps trying if the device is offline.
const PUSH_TTL_SECONDS = 6 * 3600;

module.exports = async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    if (!isConfigured()) return sendJson(res, 503, { error: 'Push is not configured' });

    const raw = await readRawBody(req);
    if (!verifyQStashSignature(req.headers['upstash-signature'], raw)) {
        return sendJson(res, 401, { error: 'Invalid signature' });
    }

    let message;
    try {
        message = JSON.parse(raw);
    } catch (e) {
        return sendJson(res, 400, { error: 'Invalid JSON' });
    }
    if (!isValidSubscription(message.subscription) || !message.payload) {
        return sendJson(res, 400, { error: 'Invalid message' });
    }

    webpush.setVapidDetails(
        env('VAPID_SUBJECT') || 'mailto:admin@example.com',
        env('VAPID_PUBLIC_KEY'),
        env('VAPID_PRIVATE_KEY')
    );

    try {
        await webpush.sendNotification(message.subscription, JSON.stringify(message.payload), {
            TTL: PUSH_TTL_SECONDS,
            urgency: 'high' // wakes Android devices from Doze
        });
        sendJson(res, 200, { sent: true });
    } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
            // Subscription expired (app uninstalled / permission revoked). Nothing to retry.
            return sendJson(res, 200, { sent: false, gone: true });
        }
        console.error('Push failed', err.statusCode, err.body);
        // Non-2xx makes QStash retry.
        sendJson(res, 502, { error: 'Push failed' });
    }
};
