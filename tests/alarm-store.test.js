/**
 * Unit tests for shared/js/alarm-store.js (alarm rules + IndexedDB + push schedule sync).
 * Run: npm test
 */
require('fake-indexeddb/auto');
const test = require('node:test');
const assert = require('node:assert');

global.self = global;
require('../shared/js/alarm-store.js');
const AlarmStore = global.AlarmStore;

const MIN = 60000;

function makeTask(overrides) {
    return Object.assign({
        id: 't-' + Math.random().toString(36).slice(2),
        title: 'Task',
        description: '',
        dueDateTime: new Date(Date.now() + 30 * MIN).toISOString(),
        completed: false,
        createdAt: new Date().toISOString(),
        priority: 'high',
        category: 'work',
        reminderMinutes: 0,
        reminderFired: false,
        dueFired: false,
        snoozedUntil: null,
        remindAgainAt: null
    }, overrides);
}

async function reset() {
    for (const task of await AlarmStore.getAllTasks()) await AlarmStore.deleteTask(task.id);
    await AlarmStore.setMeta('scheduledPushes', {});
    await AlarmStore.setMeta('missedAlarms', []);
    await AlarmStore.setMeta('pushSubscription', null);
}

test('fireDueAlarms fires a due alarm exactly once', async () => {
    await reset();
    const task = makeTask({ dueDateTime: new Date(Date.now() - 1000).toISOString() });
    await AlarmStore.putTask(task);

    const first = await AlarmStore.fireDueAlarms(Date.now());
    assert.strictEqual(first.length, 1);
    assert.strictEqual(first[0].kind, 'due');
    assert.strictEqual(first[0].task.title, 'Task');

    const second = await AlarmStore.fireDueAlarms(Date.now());
    assert.strictEqual(second.length, 0, 'flag must be persisted');
    assert.strictEqual((await AlarmStore.getTask(task.id)).dueFired, true);
});

test('reminder fires before due, and is skipped if only noticed after due', async () => {
    await reset();
    const now = Date.now();
    const soon = makeTask({ dueDateTime: new Date(now + 5 * MIN).toISOString(), reminderMinutes: 10 });
    const late = makeTask({ dueDateTime: new Date(now - MIN).toISOString(), reminderMinutes: 10 });
    await AlarmStore.putTasks([soon, late]);

    const fired = await AlarmStore.fireDueAlarms(now);
    const byTask = Object.fromEntries(fired.map(a => [a.taskId, a.kind]));
    assert.strictEqual(byTask[soon.id], 'reminder');
    assert.strictEqual(byTask[late.id], 'due', 'stale reminder suppressed, due alarm fires');
    assert.strictEqual(fired.length, 2);
    assert.strictEqual((await AlarmStore.getTask(late.id)).reminderFired, true);
});

test('completed tasks never fire', async () => {
    await reset();
    await AlarmStore.putTask(makeTask({ completed: true, dueDateTime: new Date(Date.now() - MIN).toISOString() }));
    assert.strictEqual((await AlarmStore.fireDueAlarms(Date.now())).length, 0);
});

test('snoozing a due alarm re-fires it 5 minutes later', async () => {
    await reset();
    const now = Date.now();
    const task = makeTask({ dueDateTime: new Date(now - 1000).toISOString() });
    await AlarmStore.putTask(task);
    await AlarmStore.fireDueAlarms(now);

    await AlarmStore.updateTask(task.id, t => AlarmStore.applySnooze(t, 'due', now));
    assert.strictEqual((await AlarmStore.fireDueAlarms(now + 4 * MIN)).length, 0);
    const refired = await AlarmStore.fireDueAlarms(now + 5 * MIN + 1);
    assert.strictEqual(refired.length, 1);
    assert.strictEqual(refired[0].kind, 'due');
});

test('snoozing a reminder keeps the due time', async () => {
    await reset();
    const now = Date.now();
    const task = makeTask({ dueDateTime: new Date(now + 30 * MIN).toISOString(), reminderMinutes: 30, reminderFired: true });
    await AlarmStore.putTask(task);

    await AlarmStore.updateTask(task.id, t => AlarmStore.applySnooze(t, 'reminder', now));
    const updated = await AlarmStore.getTask(task.id);
    assert.strictEqual(updated.dueDateTime, task.dueDateTime);
    assert.strictEqual(updated.snoozedUntil, null);

    const fired = await AlarmStore.fireDueAlarms(now + 5 * MIN + 1);
    assert.deepStrictEqual(fired.map(a => a.kind), ['reminder']);
});

test('missed alarms are de-duplicated and removable', async () => {
    await reset();
    await AlarmStore.addMissedAlarms([{ taskId: 'a', kind: 'due', at: 1 }, { taskId: 'a', kind: 'due', at: 1 }, { taskId: 'b', kind: 'reminder', at: 2 }]);
    assert.strictEqual((await AlarmStore.getMeta('missedAlarms', [])).length, 2);
    await AlarmStore.removeMissedAlarms('a');
    assert.deepStrictEqual((await AlarmStore.getMeta('missedAlarms', [])).map(m => m.taskId), ['b']);
});

test('buildAlarmNotification has actions, tag and data', () => {
    const n = AlarmStore.buildAlarmNotification(makeTask({ id: 'x1', title: 'Team meeting' }), 'due', 123, 456);
    assert.match(n.title, /Team meeting/);
    assert.strictEqual(n.options.tag, 'task-x1');
    assert.strictEqual(n.options.requireInteraction, true);
    assert.deepStrictEqual(n.options.actions.map(a => a.action), ['snooze', 'complete', 'dismiss']);
    assert.deepStrictEqual(n.options.data, { taskId: 'x1', kind: 'due', at: 123, firedAt: 456, action: 'alarm' });
});

test('syncPushSchedules schedules, keeps, and cancels the right alarms', async () => {
    await reset();
    await AlarmStore.setMeta('pushSubscription', { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } });
    const now = Date.now();
    const near = makeTask({ dueDateTime: new Date(now + 10 * MIN).toISOString(), reminderMinutes: 5 });
    const far = makeTask({ dueDateTime: new Date(now + 30 * 86400000).toISOString() }); // beyond the 7-day horizon
    await AlarmStore.putTasks([near, far]);

    const calls = [];
    let counter = 0;
    const fakeFetch = async (url, options) => {
        const body = JSON.parse(options.body);
        calls.push({ url, body });
        if (url === '/api/schedule') {
            return { ok: true, json: async () => ({ scheduled: body.alarms.map(a => ({ key: a.key, messageId: 'm' + (++counter) })) }) };
        }
        return { ok: true, json: async () => ({}) };
    };

    let result = await AlarmStore.syncPushSchedules(fakeFetch);
    assert.strictEqual(result.scheduled, 2, 'reminder + due of the near task');
    assert.strictEqual(calls[0].url, '/api/schedule');
    assert.ok(calls[0].body.alarms.every(a => a.taskId === near.id));
    assert.ok(!JSON.stringify(calls[0].body).includes('Task'), 'task titles never leave the device');

    // Nothing changed → no network calls.
    calls.length = 0;
    result = await AlarmStore.syncPushSchedules(fakeFetch);
    assert.strictEqual(calls.length, 0);

    // Completing the task cancels both pushes.
    await AlarmStore.updateTask(near.id, t => { t.completed = true; });
    result = await AlarmStore.syncPushSchedules(fakeFetch);
    assert.strictEqual(result.cancelled, 2);
    assert.deepStrictEqual(calls[0].body.messageIds.sort(), ['m1', 'm2']);
    assert.deepStrictEqual(await AlarmStore.getMeta('scheduledPushes', {}), {});
});

test('syncPushSchedules does nothing without a push subscription', async () => {
    await reset();
    await AlarmStore.putTask(makeTask());
    const result = await AlarmStore.syncPushSchedules(() => { throw new Error('should not fetch'); });
    assert.strictEqual(result.skipped, 'no-subscription');
});
