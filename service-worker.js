/**
 * AGT Todo Suite - Service Worker
 *
 * Responsibilities:
 *  1. Offline support: precache the app shell, stale-while-revalidate for
 *     static assets, network-first for pages and API calls.
 *  2. Background alarms: a Web Push (sent by /api/fire at the alarm time via
 *     Upstash QStash) wakes this worker even when every tab is closed. The
 *     push payload only carries a task id - the title and details are read
 *     from IndexedDB on the device.
 *  3. Notification actions: Snooze / Complete / Dismiss work without opening
 *     the app; tapping the notification opens the app and rings the alarm.
 *  4. Periodic Background Sync (Chrome/Edge, installed app only) as a bonus
 *     safety net that checks for due tasks every now and then.
 *
 * Bump APP_VERSION on every deploy that changes cached files.
 */

const APP_VERSION = '3.1.0';
const CACHE_PREFIX = 'agt-todo-';
const STATIC_CACHE = `${CACHE_PREFIX}static-${APP_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-${APP_VERSION}`;
const RUNTIME_CACHE_MAX_ENTRIES = 60; // keeps the cache far below 50MB

importScripts('/shared/js/alarm-store.js');

const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/offline.html',
    '/manifest.json',
    '/classic/index.html',
    '/classic/css/style.css',
    '/classic/js/app.js',
    '/programmable/index.html',
    '/programmable/css/style.css',
    '/programmable/js/app.js',
    '/programmable/js/alarm.js',
    '/programmable/js/notifications.js',
    '/programmable/js/dev-menu.js',
    '/shared/css/common.css',
    '/shared/css/pwa.css',
    '/shared/js/utils.js',
    '/shared/js/alarm-store.js',
    '/shared/js/notification-manager.js',
    '/shared/js/pwa-installer.js',
    '/assets/icon-192.png',
    '/assets/icon-512.png',
    '/assets/badge.png',
    '/assets/apple-touch-icon.png'
];

const log = (message) => AlarmStore.log('SW', message);

// ========================================
// LIFECYCLE
// ========================================

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(STATIC_CACHE);
        // Add one by one so a single missing file doesn't break installation.
        await Promise.all(PRECACHE_URLS.map(url =>
            cache.add(new Request(url, { cache: 'reload' })).catch(err => console.warn('[SW] precache failed', url, err))
        ));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys
            .filter(key => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE && key !== RUNTIME_CACHE)
            .map(key => caches.delete(key)));
        await self.clients.claim();
        log(`activated v${APP_VERSION}`);
    })());
});

// ========================================
// FETCH STRATEGIES
// ========================================

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirst(request));
    } else if (request.mode === 'navigate') {
        event.respondWith(navigationHandler(request));
    } else {
        event.respondWith(staleWhileRevalidate(request, event));
    }
});

async function networkFirst(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw err;
    }
}

/** Pages: always try the network so deploys show up immediately; fall back to cache, then offline.html. */
async function navigationHandler(request) {
    try {
        return await fetch(request);
    } catch (err) {
        const url = new URL(request.url);
        const cached = await caches.match(request, { ignoreSearch: true })
            || (url.pathname.endsWith('/') && await caches.match(url.pathname + 'index.html'))
            || await caches.match('/offline.html');
        return cached || Response.error();
    }
}

/** Static assets: answer from cache instantly (cache-first), refresh the cache in the background. */
async function staleWhileRevalidate(request, event) {
    const cached = await caches.match(request, { ignoreSearch: true });
    const refresh = fetch(request).then(async (response) => {
        if (response.ok) {
            const isAppShell = PRECACHE_URLS.includes(new URL(request.url).pathname);
            const cache = await caches.open(isAppShell ? STATIC_CACHE : RUNTIME_CACHE);
            await cache.put(isAppShell ? new URL(request.url).pathname : request, response.clone());
            if (!isAppShell) await trimCache(RUNTIME_CACHE, RUNTIME_CACHE_MAX_ENTRIES);
        }
        return response;
    }).catch(() => null);

    if (cached) {
        event.waitUntil(refresh);
        return cached;
    }
    return (await refresh) || Response.error();
}

async function trimCache(cacheName, maxEntries) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - maxEntries; i++) await cache.delete(keys[i]);
}

// ========================================
// HELPERS
// ========================================

async function getWindowClients() {
    return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
}

async function hasVisibleClient() {
    return (await getWindowClients()).some(c => c.visibilityState === 'visible');
}

async function broadcast(message) {
    (await getWindowClients()).forEach(client => client.postMessage(message));
}

async function syncSchedulesSafely(reason) {
    try {
        const result = await AlarmStore.syncPushSchedules(fetch);
        if (!result.skipped) log(`push schedule synced (${reason}): +${result.scheduled} / -${result.cancelled}${result.errors ? `, ${result.errors} error(s)` : ''}`);
    } catch (err) {
        log(`push schedule sync failed (${reason}): ${err.message}`);
    }
}

async function showAlarmNotification(alarm, firedAt) {
    const n = AlarmStore.buildAlarmNotification(alarm.task, alarm.kind, alarm.at, firedAt);
    await self.registration.showNotification(n.title, n.options);
}

/**
 * Fires every alarm that is due right now. Used by push, periodic sync and
 * "Force sync". If the app isn't visible, fired alarms are also recorded as
 * missed so the app can list them when it's opened.
 */
async function runBackgroundCheck(reason) {
    const now = Date.now();
    const fired = await AlarmStore.fireDueAlarms(now);
    await AlarmStore.setMeta('lastBackgroundCheck', { at: now, reason: reason, fired: fired.length });
    if (!fired.length) return fired;

    log(`${reason}: fired ${fired.length} alarm(s): ${fired.map(a => `${a.kind}:${a.taskId}`).join(', ')}`);
    await Promise.all(fired.map(alarm => showAlarmNotification(alarm, now)));

    if (!(await hasVisibleClient())) {
        await AlarmStore.addMissedAlarms(fired.map(a => ({ taskId: a.taskId, kind: a.kind, at: a.at, firedAt: now })));
    }
    await broadcast({
        type: 'ALARMS_FIRED',
        alarms: fired.map(a => ({ taskId: a.taskId, kind: a.kind, at: a.at, firedAt: now }))
    });
    return fired;
}

// ========================================
// PUSH (the reliable out-of-app alarm path)
// ========================================

function isValidPushPayload(data) {
    return data && data.v === 1 && data.type === 'alarm'
        && typeof data.taskId === 'string' && data.taskId.length <= 100
        && ['reminder', 'due', 'test'].includes(data.kind);
}

self.addEventListener('push', (event) => {
    event.waitUntil(handlePush(event));
});

async function handlePush(event) {
    let data = null;
    try {
        data = event.data ? event.data.json() : null;
    } catch (e) { /* not JSON */ }

    if (!isValidPushPayload(data)) {
        log('push received with unexpected payload');
        // Browsers require every push to show a notification.
        await self.registration.showNotification('AGT Todo', { body: 'Checking your alarms…', icon: '/assets/icon-192.png', badge: '/assets/badge.png', tag: 'agt-sync', silent: true });
        await runBackgroundCheck('push');
        return;
    }

    log(`push received: ${data.kind} for ${data.taskId}`);
    if (data.key) {
        await AlarmStore.updateMeta('scheduledPushes', {}, map => { delete map[data.key]; return map; });
    }

    if (data.kind === 'test') {
        await self.registration.showNotification('🧪 Test alarm (background push)', {
            body: 'Background alarms work! This arrived through Web Push.',
            icon: '/assets/icon-192.png',
            badge: '/assets/badge.png',
            vibrate: AlarmStore.VIBRATION_PATTERN,
            requireInteraction: true,
            tag: 'task-__test__',
            renotify: true,
            data: { taskId: '__test__', kind: 'test', firedAt: Date.now() }
        });
        await broadcast({ type: 'TEST_ALARM', firedAt: Date.now() });
        return;
    }

    const fired = await runBackgroundCheck('push');

    if (!fired.length && !(await hasVisibleClient())) {
        // The alarm was already handled (e.g. the page rang it a moment ago,
        // or the task was completed). We still must show *something*, so show
        // a quiet notification and remove it right away.
        await self.registration.showNotification('AGT Todo', { body: 'Your alarms are up to date.', icon: '/assets/icon-192.png', badge: '/assets/badge.png', tag: 'agt-sync', silent: true });
        const shown = await self.registration.getNotifications({ tag: 'agt-sync' });
        setTimeout(() => shown.forEach(n => n.close()), 1000);
    }

    // Extend the schedule horizon / clean up while we're awake.
    await syncSchedulesSafely('push');
}

// Browsers can rotate push subscriptions; re-subscribe and re-schedule everything.
self.addEventListener('pushsubscriptionchange', (event) => {
    event.waitUntil((async () => {
        try {
            const oldOptions = event.oldSubscription && event.oldSubscription.options;
            const subscription = event.newSubscription || await self.registration.pushManager.subscribe(oldOptions || { userVisibleOnly: true });
            await AlarmStore.cancelAllPushSchedules(fetch);
            await AlarmStore.setMeta('pushSubscription', subscription.toJSON());
            log('push subscription changed - re-scheduling');
            await syncSchedulesSafely('subscription-change');
        } catch (err) {
            log(`pushsubscriptionchange failed: ${err.message}`);
        }
    })());
});

// ========================================
// NOTIFICATION CLICKS (Snooze / Complete / Dismiss / open)
// ========================================

self.addEventListener('notificationclick', (event) => {
    const notification = event.notification;
    const data = notification.data || {};
    notification.close();
    event.waitUntil(handleNotificationClick(event.action, data));
});

async function handleNotificationClick(action, data) {
    const taskId = typeof data.taskId === 'string' ? data.taskId : null;
    const kind = data.kind;

    if (!taskId) return focusOrOpen('/programmable/index.html', null);

    if (kind === 'test') {
        if (!action) return focusOrOpen('/programmable/index.html', null);
        log(`test notification action: ${action}`);
        return;
    }

    if (action === 'complete') {
        await AlarmStore.updateTask(taskId, task => { task.completed = true; });
        await AlarmStore.removeMissedAlarms(taskId);
        log(`completed ${taskId} from notification`);
        await broadcast({ type: 'TASKS_CHANGED' });
        await syncSchedulesSafely('complete');
        return;
    }

    if (action === 'snooze') {
        await AlarmStore.updateTask(taskId, task => AlarmStore.applySnooze(task, kind, Date.now()));
        await AlarmStore.removeMissedAlarms(taskId);
        log(`snoozed ${kind} for ${taskId} from notification`);
        await broadcast({ type: 'TASKS_CHANGED' });
        await syncSchedulesSafely('snooze');
        return;
    }

    if (action === 'dismiss') {
        await AlarmStore.removeMissedAlarms(taskId);
        log(`dismissed ${kind} for ${taskId} from notification`);
        await broadcast({ type: 'TASKS_CHANGED' });
        return;
    }

    // Tapped the notification body: open the app on the full-screen alarm.
    await AlarmStore.removeMissedAlarms(taskId);
    const params = new URLSearchParams({ alarm: taskId, kind: kind || 'due', firedAt: String(data.firedAt || Date.now()) });
    return focusOrOpen(`/programmable/index.html?${params}`, { type: 'SHOW_ALARM', taskId: taskId, kind: kind || 'due', firedAt: data.firedAt || Date.now() });
}

async function focusOrOpen(url, message) {
    const windows = await getWindowClients();
    const existing = windows.find(c => new URL(c.url).pathname.startsWith('/programmable/'));
    if (existing) {
        await existing.focus();
        if (message) existing.postMessage(message);
        return;
    }
    return self.clients.openWindow(url);
}

// ========================================
// PERIODIC BACKGROUND SYNC (Chrome/Edge installed apps - best effort)
// ========================================

self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'check-tasks') {
        event.waitUntil((async () => {
            await runBackgroundCheck('periodic-sync');
            await syncSchedulesSafely('periodic-sync');
        })());
    }
});

// ========================================
// MESSAGES FROM THE APP
// ========================================

const ALLOWED_MESSAGES = ['GET_STATUS', 'CHECK_NOW', 'TEST_NOTIFICATION', 'SYNC_SCHEDULES'];

self.addEventListener('message', (event) => {
    // Only accept messages from our own pages, with a known type.
    const source = event.source;
    if (!source || !source.url || new URL(source.url).origin !== self.location.origin) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || !ALLOWED_MESSAGES.includes(data.type)) return;

    const reply = (payload) => {
        if (event.ports && event.ports[0]) event.ports[0].postMessage(payload);
    };

    event.waitUntil((async () => {
        try {
            switch (data.type) {
                case 'GET_STATUS':
                    reply(await getStatus());
                    break;
                case 'CHECK_NOW': {
                    const fired = await runBackgroundCheck('manual');
                    await syncSchedulesSafely('manual');
                    reply({ ok: true, fired: fired.length, status: await getStatus() });
                    break;
                }
                case 'SYNC_SCHEDULES':
                    await syncSchedulesSafely('app');
                    reply({ ok: true });
                    break;
                case 'TEST_NOTIFICATION':
                    await self.registration.showNotification('🔔 Test notification', {
                        body: 'Shown by the service worker - this is how alarms will look.',
                        icon: '/assets/icon-192.png',
                        badge: '/assets/badge.png',
                        vibrate: AlarmStore.VIBRATION_PATTERN,
                        tag: 'task-__test__',
                        renotify: true,
                        data: { taskId: '__test__', kind: 'test', firedAt: Date.now() }
                    });
                    log('test notification shown');
                    reply({ ok: true });
                    break;
            }
        } catch (err) {
            log(`message ${data.type} failed: ${err.message}`);
            reply({ ok: false, error: err.message });
        }
    })());
});

async function getStatus() {
    const cacheNames = (await caches.keys()).filter(k => k.startsWith(CACHE_PREFIX));
    const subscription = await self.registration.pushManager.getSubscription().catch(() => null);
    const scheduled = await AlarmStore.getMeta('scheduledPushes', {});
    let periodicTags = null;
    if (self.registration.periodicSync) {
        periodicTags = await self.registration.periodicSync.getTags().catch(() => null);
    }
    return {
        version: APP_VERSION,
        scope: self.registration.scope,
        caches: cacheNames,
        pushSubscribed: !!subscription,
        pushEndpoint: subscription ? subscription.endpoint.slice(0, 60) + '…' : null,
        scheduledPushes: Object.keys(scheduled).length,
        lastPushSync: await AlarmStore.getMeta('lastPushSync', null),
        lastBackgroundCheck: await AlarmStore.getMeta('lastBackgroundCheck', null),
        periodicSyncTags: periodicTags,
        log: (await AlarmStore.getMeta('eventLog', [])).slice(-25)
    };
}
