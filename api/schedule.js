/**
 * POST /api/schedule
 * Body: { subscription, alarms: [{ key, taskId, kind, fireAt }] }
 *
 * For each alarm, asks Upstash QStash to call /api/fire at `fireAt`.
 * Nothing is stored on our side: the push subscription and the (opaque) task
 * id travel inside the QStash message. Task titles are never sent here.
 */
const {
    isConfigured, maxDelayDays, appUrl, sendJson, isSameOrigin, readJson,
    isValidSubscription, qstashPublish
} = require('./_utils');

const MAX_ALARMS_PER_REQUEST = 50;
const KINDS = ['reminder', 'due', 'test'];

module.exports = async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    if (!isConfigured()) return sendJson(res, 503, { error: 'Push is not configured' });
    if (!isSameOrigin(req)) return sendJson(res, 403, { error: 'Forbidden' });

    let body;
    try {
        body = await readJson(req);
    } catch (e) {
        return sendJson(res, 400, { error: 'Invalid JSON' });
    }

    const { subscription, alarms } = body || {};
    if (!isValidSubscription(subscription)) return sendJson(res, 400, { error: 'Invalid subscription' });
    if (!Array.isArray(alarms) || alarms.length === 0 || alarms.length > MAX_ALARMS_PER_REQUEST) {
        return sendJson(res, 400, { error: `alarms must be an array of 1-${MAX_ALARMS_PER_REQUEST}` });
    }

    const now = Date.now();
    const latest = now + maxDelayDays() * 86400000;
    const destination = `${appUrl(req)}/api/fire`;
    const cleanSubscription = {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth }
    };

    const scheduled = await Promise.all(alarms.map(async (alarm) => {
        const key = alarm && typeof alarm.key === 'string' ? alarm.key.slice(0, 200) : null;
        const valid = key
            && typeof alarm.taskId === 'string' && alarm.taskId.length > 0 && alarm.taskId.length <= 100
            && KINDS.includes(alarm.kind)
            && Number.isFinite(alarm.fireAt) && alarm.fireAt > now - 5 * 60000 && alarm.fireAt <= latest;
        if (!valid) return { key, error: 'invalid alarm' };

        try {
            const messageId = await qstashPublish(destination, JSON.stringify({
                subscription: cleanSubscription,
                payload: { v: 1, type: 'alarm', key: key, taskId: alarm.taskId, kind: alarm.kind, fireAt: alarm.fireAt }
            }), Math.ceil(alarm.fireAt / 1000));
            return { key, messageId };
        } catch (err) {
            console.error(err.message);
            return { key, error: 'schedule failed' };
        }
    }));

    sendJson(res, 200, { scheduled });
};
