/**
 * AlarmStore - task storage + alarm rules shared by the Programmable Todo page
 * AND the service worker.
 *
 * Why IndexedDB: service workers cannot read localStorage, so for the service
 * worker to fire alarms while the app is closed, tasks must live somewhere both
 * sides can see. Every write is a single read-modify-write transaction, so the
 * page and the service worker never overwrite each other's changes.
 *
 * This file must not touch the DOM: it is loaded with importScripts() inside
 * the service worker.
 */
(function (global) {
    'use strict';

    const DB_NAME = 'agt-todo-alarms';
    const DB_VERSION = 1;
    const SNOOZE_MINUTES = 5;
    // An alarm discovered more than this long after its time is "missed"
    // (listed in the Missed Alarms section) instead of ringing.
    const MISSED_AFTER_MS = 15 * 60 * 1000;
    // Upstash QStash free tier accepts delays of up to 7 days. Alarms further
    // out are scheduled later, the next time the app or service worker syncs.
    const DEFAULT_HORIZON_DAYS = 7;
    const MAX_LOG_ENTRIES = 60;
    const VIBRATION_PATTERN = [500, 200, 500, 200, 500, 200, 500];

    // ========================================
    // INDEXEDDB PLUMBING
    // ========================================

    let dbPromise = null;

    function openDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const request = global.indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('tasks')) db.createObjectStore('tasks', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
            };
            request.onsuccess = () => {
                const db = request.result;
                db.onversionchange = () => {
                    db.close();
                    dbPromise = null;
                };
                resolve(db);
            };
            request.onerror = () => {
                dbPromise = null;
                reject(request.error);
            };
        });
        return dbPromise;
    }

    /**
     * Runs `work(store)` inside one transaction and resolves with whatever
     * `work` stored in `ctx.result` once the transaction has committed.
     */
    function withStore(storeName, mode, work) {
        return openDB().then(db => new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, mode);
            const ctx = { result: undefined };
            transaction.oncomplete = () => resolve(ctx.result);
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
            work(transaction.objectStore(storeName), ctx);
        }));
    }

    // ========================================
    // TASKS
    // ========================================

    function getAllTasks() {
        return withStore('tasks', 'readonly', (store, ctx) => {
            const request = store.getAll();
            request.onsuccess = () => { ctx.result = request.result || []; };
        });
    }

    function getTask(id) {
        return withStore('tasks', 'readonly', (store, ctx) => {
            const request = store.get(id);
            request.onsuccess = () => { ctx.result = request.result || null; };
        });
    }

    function putTask(task) {
        return withStore('tasks', 'readwrite', store => { store.put(task); });
    }

    function putTasks(taskList) {
        return withStore('tasks', 'readwrite', store => { taskList.forEach(task => store.put(task)); });
    }

    function deleteTask(id) {
        return withStore('tasks', 'readwrite', store => { store.delete(id); });
    }

    /** Atomically applies `mutate(task)` and resolves with the updated task (or null if not found). */
    function updateTask(id, mutate) {
        return withStore('tasks', 'readwrite', (store, ctx) => {
            ctx.result = null;
            const request = store.get(id);
            request.onsuccess = () => {
                const task = request.result;
                if (!task) return;
                mutate(task);
                store.put(task);
                ctx.result = task;
            };
        });
    }

    // ========================================
    // META (key/value: push subscription, schedules, missed alarms, logs)
    // ========================================

    function getMeta(key, fallback) {
        return withStore('meta', 'readonly', (store, ctx) => {
            const request = store.get(key);
            request.onsuccess = () => { ctx.result = request.result === undefined ? fallback : request.result; };
        });
    }

    function setMeta(key, value) {
        return withStore('meta', 'readwrite', store => { store.put(value, key); });
    }

    /** Atomic read-modify-write of a meta value. `mutate` returns the new value. */
    function updateMeta(key, fallback, mutate) {
        return withStore('meta', 'readwrite', (store, ctx) => {
            const request = store.get(key);
            request.onsuccess = () => {
                const current = request.result === undefined ? fallback : request.result;
                ctx.result = mutate(current);
                store.put(ctx.result, key);
            };
        });
    }

    // ========================================
    // ALARM RULES
    // ========================================

    function getEffectiveDueTime(task) {
        return new Date(task.snoozedUntil || task.dueDateTime).getTime();
    }

    function getReminderTime(task) {
        if (!(task.reminderMinutes > 0)) return null;
        if (task.remindAgainAt) return new Date(task.remindAgainAt).getTime();
        return getEffectiveDueTime(task) - task.reminderMinutes * 60000;
    }

    /** Alarms of a task that have not fired yet: [{ taskId, kind, at }]. */
    function getPendingAlarms(task) {
        if (task.completed) return [];
        const due = getEffectiveDueTime(task);
        const pending = [];
        const reminderAt = getReminderTime(task);
        if (reminderAt !== null && !task.reminderFired && reminderAt < due) {
            pending.push({ taskId: task.id, kind: 'reminder', at: reminderAt });
        }
        if (!task.dueFired) pending.push({ taskId: task.id, kind: 'due', at: due });
        return pending;
    }

    /**
     * Marks every alarm whose time has come as fired, in ONE transaction, and
     * returns them as [{ taskId, kind, at, task }]. Because the flags are
     * flipped atomically, the page and the service worker can both call this
     * and each alarm is only ever returned once.
     */
    function fireDueAlarms(now) {
        return withStore('tasks', 'readwrite', (store, ctx) => {
            ctx.result = [];
            const request = store.getAll();
            request.onsuccess = () => {
                (request.result || []).forEach(task => {
                    const fired = [];
                    let changed = false;
                    const due = getEffectiveDueTime(task);
                    getPendingAlarms(task).forEach(alarm => {
                        if (now < alarm.at) return;
                        changed = true;
                        if (alarm.kind === 'reminder') {
                            task.reminderFired = true;
                            task.remindAgainAt = null;
                            // The due alarm supersedes a reminder we only noticed after the due time.
                            if (now >= due) return;
                        } else {
                            task.dueFired = true;
                        }
                        fired.push(alarm);
                    });
                    if (changed) store.put(task);
                    fired.forEach(alarm => ctx.result.push(Object.assign({}, alarm, { task: task })));
                });
            };
        });
    }

    /** Snooze: the reminder re-rings in 5 min, or the due alarm moves 5 min from now. */
    function applySnooze(task, kind, now) {
        const until = now + SNOOZE_MINUTES * 60000;
        if (kind === 'reminder') {
            if (until < getEffectiveDueTime(task)) {
                task.remindAgainAt = new Date(until).toISOString();
                task.reminderFired = false;
            }
            // Otherwise the due alarm comes first anyway.
            return;
        }
        task.snoozedUntil = new Date(until).toISOString();
        task.dueFired = false;
        task.reminderFired = true;
    }

    // ========================================
    // NOTIFICATION CONTENT (same look from page and service worker)
    // ========================================

    function priorityLabel(priority) {
        const icons = { high: '🔴', medium: '🟡', low: '🟢' };
        return `${icons[priority] || '⚪'} ${String(priority || 'medium').toUpperCase()} priority`;
    }

    function buildAlarmNotification(task, kind, at, firedAt) {
        const due = getEffectiveDueTime(task);
        const minutesLeft = Math.max(0, Math.round((due - Date.now()) / 60000));
        const title = kind === 'due' ? `🚨 Task Due: ${task.title}` : `⏰ Reminder: ${task.title}`;
        const when = kind === 'due'
            ? 'Due now'
            : `Due in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}`;
        return {
            title: title,
            options: {
                body: `${when} · ${priorityLabel(task.priority)}${task.description ? '\n' + task.description : ''}`,
                icon: '/assets/icon-192.png',
                badge: '/assets/badge.png',
                vibrate: VIBRATION_PATTERN,
                requireInteraction: true,
                tag: 'task-' + task.id,
                renotify: true,
                silent: false,
                timestamp: at || Date.now(),
                data: { taskId: task.id, kind: kind, at: at, firedAt: firedAt || Date.now(), action: 'alarm' },
                actions: [
                    { action: 'snooze', title: `🔕 Snooze ${SNOOZE_MINUTES} min` },
                    { action: 'complete', title: '✅ Complete' },
                    { action: 'dismiss', title: '❌ Dismiss' }
                ]
            }
        };
    }

    // ========================================
    // MISSED ALARMS
    // ========================================

    function addMissedAlarms(entries) {
        if (!entries.length) return Promise.resolve();
        return updateMeta('missedAlarms', [], list => {
            entries.forEach(entry => {
                const exists = list.some(m => m.taskId === entry.taskId && m.kind === entry.kind);
                if (!exists) list.push({ taskId: entry.taskId, kind: entry.kind, at: entry.at, firedAt: entry.firedAt || Date.now() });
            });
            return list;
        });
    }

    function removeMissedAlarms(taskId) {
        return updateMeta('missedAlarms', [], list => list.filter(m => m.taskId !== taskId));
    }

    // ========================================
    // EVENT LOG (visible in the dev menu, survives the service worker being killed)
    // ========================================

    function log(source, message) {
        const entry = { t: new Date().toISOString(), source: source, message: message };
        console.log(`[${source} ${entry.t}] ${message}`);
        return updateMeta('eventLog', [], list => {
            list.push(entry);
            return list.slice(-MAX_LOG_ENTRIES);
        }).catch(() => { });
    }

    // ========================================
    // PUSH SCHEDULE SYNC
    // ========================================

    /**
     * Makes the server-side schedule match the tasks in IndexedDB.
     *
     * For every pending alarm inside the horizon we want exactly one QStash
     * message that will trigger a Web Push at the alarm time. Keys include the
     * alarm time, so editing/snoozing a task automatically cancels the old push
     * and schedules a new one. Only the push endpoint, task id, alarm kind and
     * time are sent - task titles never leave the device.
     */
    function syncPushSchedules(fetchImpl) {
        const run = async () => {
            const subscription = await getMeta('pushSubscription', null);
            if (!subscription) return { skipped: 'no-subscription' };

            const scheduled = await getMeta('scheduledPushes', {});
            const horizonDays = await getMeta('pushHorizonDays', DEFAULT_HORIZON_DAYS);
            const now = Date.now();
            const limit = now + horizonDays * 86400000 - 60000;

            const desired = {};
            (await getAllTasks()).forEach(task => {
                getPendingAlarms(task).forEach(alarm => {
                    if (alarm.at <= limit) desired[`${alarm.taskId}|${alarm.kind}|${alarm.at}`] = alarm;
                });
            });

            const toCancel = Object.keys(scheduled).filter(key => !desired[key]);
            // Past-due alarms that were never scheduled are handled locally, not by push.
            const toAdd = Object.keys(desired).filter(key => !scheduled[key] && desired[key].at > now - 5000).slice(0, 50);
            const result = { cancelled: 0, scheduled: 0, errors: 0 };

            if (toCancel.length) {
                const res = await fetchImpl('/api/cancel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messageIds: toCancel.map(key => scheduled[key]) })
                });
                if (res.ok) {
                    toCancel.forEach(key => { delete scheduled[key]; });
                    result.cancelled = toCancel.length;
                } else {
                    result.errors++;
                }
            }

            if (toAdd.length) {
                const res = await fetchImpl('/api/schedule', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        subscription: subscription,
                        alarms: toAdd.map(key => ({ key: key, taskId: desired[key].taskId, kind: desired[key].kind, fireAt: desired[key].at }))
                    })
                });
                if (res.ok) {
                    const data = await res.json();
                    (data.scheduled || []).forEach(item => {
                        if (item.messageId) {
                            scheduled[item.key] = item.messageId;
                            result.scheduled++;
                        } else {
                            result.errors++;
                        }
                    });
                } else {
                    result.errors++;
                }
            }

            await setMeta('scheduledPushes', scheduled);
            await setMeta('lastPushSync', { at: now, result: result });
            return result;
        };

        // Page and service worker may sync at the same moment - serialise them.
        const locks = global.navigator && global.navigator.locks;
        return locks ? locks.request('agt-push-sync', run) : run();
    }

    /** Cancels every scheduled push (used when the push subscription changes). */
    async function cancelAllPushSchedules(fetchImpl) {
        const scheduled = await getMeta('scheduledPushes', {});
        const ids = Object.values(scheduled);
        if (ids.length) {
            try {
                await fetchImpl('/api/cancel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messageIds: ids })
                });
            } catch (e) { /* stale pushes just fail at the push service */ }
        }
        await setMeta('scheduledPushes', {});
    }

    global.AlarmStore = {
        SNOOZE_MINUTES,
        MISSED_AFTER_MS,
        VIBRATION_PATTERN,
        getAllTasks,
        getTask,
        putTask,
        putTasks,
        deleteTask,
        updateTask,
        getMeta,
        setMeta,
        updateMeta,
        getEffectiveDueTime,
        getPendingAlarms,
        fireDueAlarms,
        applySnooze,
        buildAlarmNotification,
        addMissedAlarms,
        removeMissedAlarms,
        log,
        syncPushSchedules,
        cancelAllPushSchedules
    };
})(typeof self !== 'undefined' ? self : this);
