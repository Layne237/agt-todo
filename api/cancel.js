/**
 * POST /api/cancel
 * Body: { messageIds: ["msg_..."] }
 * Cancels scheduled QStash messages (task completed, deleted, snoozed or edited).
 */
const { isConfigured, sendJson, isSameOrigin, readJson, qstashCancel } = require('./_utils');

const MAX_IDS = 100;

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

    const ids = body && Array.isArray(body.messageIds) ? body.messageIds : null;
    if (!ids || ids.length > MAX_IDS || !ids.every(id => typeof id === 'string' && /^[\w-]{1,100}$/.test(id))) {
        return sendJson(res, 400, { error: 'Invalid messageIds' });
    }

    const results = await Promise.allSettled(ids.map(qstashCancel));
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed) console.error(`${failed} cancel(s) failed`);
    sendJson(res, failed ? 502 : 200, { cancelled: ids.length - failed, failed });
};
