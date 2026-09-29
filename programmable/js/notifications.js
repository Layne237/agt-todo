/**
 * Programmable Todo - Notifications & background alarms
 *
 * Flow:
 *   1. Permission is asked on the first task creation (or via the "Enable" button).
 *   2. Once granted, the page subscribes to Web Push with the server's VAPID key.
 *   3. After every task change, the list of upcoming alarms is synced to
 *      /api/schedule, which asks Upstash QStash to trigger a push at each
 *      alarm time. The push wakes the service worker even if the app is closed.
 *   4. The status banner explains what works on this browser, and what to do
 *      (install the app on iOS, unblock notifications, ...).
 *
 * Uses globals from app.js / alarm.js: reloadTasks, renderTasks, showToast,
 * refreshMissedAlarms, handleFiredAlarms, showAlarmFromNotification, testAlarm, alarmLog.
 */

const SCHEDULE_SYNC_DELAY_MS = 800;
const PERIODIC_SYNC_MIN_INTERVAL_MS = 15 * 60 * 1000;

// 'pending' | 'active' | 'no-permission' | 'unsupported' | 'server-missing' | 'error'
let pushState = 'pending';
let pushError = null;
let scheduleSyncTimerId = null;

const notifyEls = {
    status: document.getElementById('alarmStatus'),
    statusIcon: document.getElementById('alarmStatusIcon'),
    statusText: document.getElementById('alarmStatusText'),
    statusActions: document.getElementById('alarmStatusActions')
};

function isPushActive() {
    return pushState === 'active';
}

// ========================================
// PERMISSION
// ========================================

/** Must run inside a click handler: Safari and iOS only show the prompt for user gestures. */
async function enableNotifications() {
    const result = await NotificationManager.requestPermission();
    alarmLog(`notification permission: ${result}`);
    if (result === 'granted') {
        showToast('🔔 Notifications enabled', 'success');
        await refreshBackgroundAlarms();
    }
    renderAlarmStatus();
    return result;
}

/** Called synchronously at the start of addTask(), so the prompt keeps the click's user gesture. */
function askPermissionOnFirstTask() {
    if (NotificationManager.permission() !== 'default') return Promise.resolve();
    if (NotificationManager.backgroundSupport() === 'needs-install') return Promise.resolve();
    return enableNotifications();
}

async function sendTestNotification() {
    const shown = await NotificationManager.show('🔔 Test notification', {
        body: 'Notifications work! Your alarms will look like this.',
        icon: '/assets/icon-192.png',
        badge: '/assets/badge.png',
        vibrate: AlarmStore.VIBRATION_PATTERN,
        tag: 'task-__test__',
        renotify: true,
        data: { taskId: '__test__', kind: 'test' }
    });
    showToast(shown ? '🔔 Test notification sent' : '⚠️ Could not show a notification', shown ? 'success' : 'error');
}

function permissionHelpSteps() {
    const p = NotificationManager.platform;
    if (p.isIOS) return ['Open the iPhone Settings app.', 'Go to Notifications → AGT Todo.', 'Turn on "Allow Notifications", then reopen the app.'];
    if (p.isAndroid) return ['Long-press the AGT Todo (or browser) icon → App info.', 'Tap Notifications and turn them on.', 'Also set Battery to "Unrestricted" so alarms are not delayed.', 'Reopen the app.'];
    if (p.browser === 'firefox') return ['Click the permissions icon left of the address bar.', 'Remove the "Blocked" setting for notifications.', 'Reload the page and click "Enable".'];
    if (p.browser === 'safari') return ['Open Safari → Settings → Websites → Notifications.', 'Set this site to "Allow".', 'Reload the page.'];
    return ['Click the 🔒 icon left of the address bar.', 'Set Notifications to "Allow".', 'Reload the page.'];
}

// ========================================
// WEB PUSH SUBSCRIPTION
// ========================================

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from(raw, c => c.charCodeAt(0));
}

function withTimeout(promise, ms, message) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
    ]);
}

async function fetchPushConfig() {
    try {
        const res = await fetch('/api/vapid-public-key', { cache: 'no-store' });
        if (!res.ok) return { configured: false };
        return await res.json();
    } catch (e) {
        return { configured: false, offline: true };
    }
}

/** Subscribes to Web Push (if possible) and syncs the alarm schedule. Safe to call repeatedly. */
async function refreshBackgroundAlarms() {
    pushError = null;

    if (NotificationManager.permission() !== 'granted') {
        pushState = 'no-permission';
        renderAlarmStatus();
        return;
    }

    let registration = null;
    try {
        registration = await withTimeout(navigator.serviceWorker.ready, 10000, 'service worker not ready');
    } catch (e) {
        pushState = NotificationManager.supportsServiceWorker ? 'error' : 'unsupported';
        pushError = e.message;
        renderAlarmStatus();
        return;
    }

    registerPeriodicSync(registration);

    if (!NotificationManager.supportsPush) {
        pushState = 'unsupported';
        renderAlarmStatus();
        return;
    }

    const config = await fetchPushConfig();
    if (!config.configured) {
        // Offline: keep an existing subscription working, just don't re-check the key now.
        const existing = await AlarmStore.getMeta('pushSubscription', null);
        pushState = config.offline && existing ? 'active' : 'server-missing';
        renderAlarmStatus();
        return;
    }

    try {
        await AlarmStore.setMeta('pushHorizonDays', config.maxDelayDays || 7);

        let subscription = await registration.pushManager.getSubscription();
        const storedKey = await AlarmStore.getMeta('pushPublicKey', null);
        if (subscription && storedKey && storedKey !== config.publicKey) {
            // Server keys were rotated: the old subscription can't receive our pushes anymore.
            await subscription.unsubscribe();
            subscription = null;
        }
        if (!subscription) {
            // subscribe() can hang when the browser can't reach its push service.
            subscription = await withTimeout(registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(config.publicKey)
            }), 20000, 'push service unreachable');
            alarmLog('subscribed to web push');
        }

        const stored = await AlarmStore.getMeta('pushSubscription', null);
        if (!stored || stored.endpoint !== subscription.endpoint) {
            // New endpoint: pushes scheduled for the old one would go nowhere.
            await AlarmStore.cancelAllPushSchedules((...args) => fetch(...args));
        }
        await AlarmStore.setMeta('pushSubscription', subscription.toJSON());
        await AlarmStore.setMeta('pushPublicKey', config.publicKey);

        pushState = 'active';
        requestScheduleSync(0);
    } catch (e) {
        pushState = 'error';
        pushError = e.message;
        alarmLog(`push subscription failed: ${e.message}`);
    }
    renderAlarmStatus();
}

/** Periodic Background Sync: Chrome/Edge only, installed app only, runs every ~12h at best. A bonus. */
async function registerPeriodicSync(registration) {
    if (!registration || !('periodicSync' in registration)) return false;
    try {
        const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
        if (status.state !== 'granted') return false;
        await registration.periodicSync.register('check-tasks', { minInterval: PERIODIC_SYNC_MIN_INTERVAL_MS });
        return true;
    } catch (e) {
        return false;
    }
}

/** Debounced: pushes the current alarm list to the server schedule. */
function requestScheduleSync(delay) {
    if (pushState !== 'active') return;
    clearTimeout(scheduleSyncTimerId);
    scheduleSyncTimerId = setTimeout(async () => {
        try {
            const result = await AlarmStore.syncPushSchedules((...args) => fetch(...args));
            if (result.scheduled || result.cancelled || result.errors) {
                alarmLog(`push schedule synced: +${result.scheduled} / -${result.cancelled}${result.errors ? `, ${result.errors} error(s)` : ''}`);
            }
        } catch (e) {
            alarmLog(`push schedule sync failed: ${e.message}`);
        }
    }, delay === undefined ? SCHEDULE_SYNC_DELAY_MS : delay);
}

/** Dev menu: schedules a real background push in `delaySeconds`. */
async function schedulePushTest(delaySeconds) {
    const subscription = await AlarmStore.getMeta('pushSubscription', null);
    if (!isPushActive() || !subscription) return null;
    const fireAt = Date.now() + delaySeconds * 1000;
    const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            subscription: subscription,
            alarms: [{ key: `__test__|test|${fireAt}`, taskId: '__test__', kind: 'test', fireAt: fireAt }]
        })
    });
    if (!res.ok) throw new Error(`schedule failed (${res.status})`);
    const data = await res.json();
    return data.scheduled && data.scheduled[0] && data.scheduled[0].messageId;
}

// ========================================
// STATUS BANNER
// ========================================

function getAlarmStatus() {
    const support = NotificationManager.backgroundSupport();
    const permission = NotificationManager.permission();
    const canInstall = window.PWA && !PWA.isInstalled();

    if (support === 'needs-install') {
        return { level: 'warn', icon: '📱', text: 'Install this app on your home screen to enable alarms.', actions: [['install', 'How to install']] };
    }
    if (permission === 'unsupported') {
        return {
            level: 'warn', icon: '⚠️', text: 'For alarms to work in the background, please install this app. Until then, alarms only ring while this page is open.',
            actions: canInstall ? [['install', 'Install']] : []
        };
    }
    if (permission === 'denied') {
        return { level: 'error', icon: '🔕', text: 'Notifications are blocked, so alarms only ring while this page is open.', actions: [['permission-help', 'How to fix']] };
    }
    if (permission === 'default') {
        return { level: 'warn', icon: '🔔', text: 'Enable notifications to get alarms.', actions: [['enable', 'Enable']] };
    }

    switch (pushState) {
        case 'active':
            return { level: 'ok', icon: '🟢', text: 'Background alarms are on: they ring even when the app is closed.', actions: [['test', 'Test']] };
        case 'server-missing':
            return { level: 'warn', icon: '🟡', text: 'Alarms ring while this page is open. Background push is not set up on the server yet.', actions: [['test', 'Test']] };
        case 'unsupported':
            return {
                level: 'warn', icon: '⚠️', text: 'For alarms to work in the background, please install this app. Until then, alarms only ring while this page is open.',
                actions: (canInstall ? [['install', 'Install']] : []).concat([['test', 'Test']])
            };
        case 'error':
            return { level: 'warn', icon: '🟡', text: `Background alarms are unavailable (${pushError || 'unknown error'}). Alarms ring while this page is open.`, actions: [['retry', 'Retry'], ['test', 'Test']] };
        default:
            return { level: 'info', icon: '⏳', text: 'Setting up background alarms…', actions: [] };
    }
}

function renderAlarmStatus() {
    if (!notifyEls.status) return;
    const status = getAlarmStatus();
    notifyEls.status.className = `alarm-status alarm-status-${status.level}`;
    notifyEls.statusIcon.textContent = status.icon;
    notifyEls.statusText.textContent = status.text;
    notifyEls.statusActions.innerHTML = status.actions
        .map(([action, label]) => `<button class="btn-small" data-status-action="${action}">${label}</button>`)
        .join('');

    // On phones, installing still makes background delivery more reliable.
    if (status.level === 'ok' && NotificationManager.platform.isMobile && window.PWA) PWA.showInstallBanner();
}

async function handleStatusAction(action) {
    switch (action) {
        case 'enable':
            await enableNotifications();
            break;
        case 'test':
            await sendTestNotification();
            break;
        case 'install':
            await PWA.promptInstall();
            break;
        case 'permission-help':
            PWA.showInstructions(permissionHelpSteps(), '🔕 Allow notifications');
            break;
        case 'retry':
            pushState = 'pending';
            renderAlarmStatus();
            await refreshBackgroundAlarms();
            break;
    }
}

// ========================================
// MESSAGES FROM THE SERVICE WORKER
// ========================================

function listenToServiceWorker() {
    if (!NotificationManager.supportsServiceWorker) return;

    navigator.serviceWorker.addEventListener('message', async (event) => {
        if (event.origin && event.origin !== window.location.origin) return;
        const data = event.data;
        if (!data || typeof data.type !== 'string') return;

        switch (data.type) {
            case 'TASKS_CHANGED':
                // A notification action (complete/snooze) changed tasks while the page was open.
                await reloadTasks();
                renderTasks();
                await refreshMissedAlarms(false);
                break;
            case 'ALARMS_FIRED':
                if (!Array.isArray(data.alarms)) return;
                await reloadTasks();
                renderTasks();
                await handleFiredAlarms(data.alarms.filter(a => typeof a.taskId === 'string'), 'service-worker');
                break;
            case 'SHOW_ALARM':
                if (typeof data.taskId !== 'string') return;
                await reloadTasks();
                showAlarmFromNotification(data.taskId, data.kind, data.firedAt);
                break;
            case 'TEST_ALARM':
                if (document.visibilityState === 'visible') testAlarm(0);
                break;
        }
    });
}

// ========================================
// INIT
// ========================================

async function initNotificationSystem() {
    listenToServiceWorker();

    if (notifyEls.statusActions) {
        notifyEls.statusActions.addEventListener('click', (e) => {
            const button = e.target.closest('[data-status-action]');
            if (button) handleStatusAction(button.dataset.statusAction);
        });
    }

    renderAlarmStatus();
    await refreshBackgroundAlarms();

    window.addEventListener('online', () => requestScheduleSync());
    // The permission can change in browser settings while the app is open.
    if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'notifications' }).then(status => {
            status.onchange = () => refreshBackgroundAlarms();
        }).catch(() => { });
    }
}
