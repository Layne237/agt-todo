/**
 * Programmable Todo - hidden developer menu
 * Open with Ctrl+Shift+D, or by tapping the "Programmable Todo" logo 5 times.
 *
 * Uses globals from alarm.js / notifications.js: testAlarm, isPushActive,
 * schedulePushTest, refreshBackgroundAlarms, requestScheduleSync, pushState, pushError.
 */

const DEV_TAP_COUNT = 5;
const DEV_TAP_WINDOW_MS = 3000;
let devTapTimes = [];

const devEls = {
    menu: document.getElementById('devMenu'),
    output: document.getElementById('devOutput'),
    logo: document.getElementById('appLogo')
};

function toggleDevMenu(force) {
    if (!devEls.menu) return;
    const open = force === undefined ? !devEls.menu.classList.contains('active') : force;
    devEls.menu.classList.toggle('active', open);
}

function devOutput(value) {
    if (!devEls.output) return;
    devEls.output.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

/** Sends a message to the service worker and waits for its reply on a MessageChannel. */
async function messageServiceWorker(message, timeoutMs) {
    const registration = await NotificationManager.getRegistration();
    const worker = registration && (registration.active || registration.waiting || registration.installing);
    if (!worker) throw new Error('No service worker is registered yet (reload the page once).');

    return new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => reject(new Error('The service worker did not answer.')), timeoutMs || 10000);
        channel.port1.onmessage = (event) => {
            clearTimeout(timer);
            resolve(event.data);
        };
        worker.postMessage(message, [channel.port2]);
    });
}

async function runDevAction(action) {
    devOutput('…');
    try {
        switch (action) {
            case 'bg-notification': {
                const reply = await messageServiceWorker({ type: 'TEST_NOTIFICATION' });
                devOutput(reply && reply.ok ? '✅ The service worker showed a notification.' : reply);
                break;
            }
            case 'alarm-10s': {
                if (isPushActive()) {
                    const messageId = await schedulePushTest(10);
                    devOutput(`✅ Background push scheduled (${messageId}).\n\nClose the app or lock the phone now: a notification should arrive in ~10 s.\nIf the page stays open, the alarm also rings here.`);
                } else {
                    testAlarm(10);
                    devOutput(`⚠️ Background push is not active (state: ${pushState}${pushError ? `, ${pushError}` : ''}).\nIn-page alarm will ring in 10 s - keep this page open.`);
                }
                break;
            }
            case 'alarm-now':
                toggleDevMenu(false);
                testAlarm(0);
                break;
            case 'sw-status':
                devOutput(await messageServiceWorker({ type: 'GET_STATUS' }));
                break;
            case 'permission': {
                const registration = await NotificationManager.getRegistration();
                const subscription = registration && registration.pushManager ? await registration.pushManager.getSubscription() : null;
                devOutput({
                    permission: NotificationManager.permission(),
                    backgroundSupport: NotificationManager.backgroundSupport(),
                    pushState: pushState,
                    pushError: pushError,
                    browser: NotificationManager.platform.browser,
                    iOS: NotificationManager.platform.isIOS,
                    android: NotificationManager.platform.isAndroid,
                    installed: NotificationManager.platform.isStandalone(),
                    supportsPush: NotificationManager.supportsPush,
                    supportsPeriodicSync: NotificationManager.supportsPeriodicSync,
                    serviceWorkerControlling: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
                    pushEndpoint: subscription ? subscription.endpoint.slice(0, 60) + '…' : null
                });
                break;
            }
            case 'force-sync': {
                await refreshBackgroundAlarms();
                const reply = await messageServiceWorker({ type: 'CHECK_NOW' }, 20000);
                devOutput(reply);
                break;
            }
            case 'event-log': {
                const log = await AlarmStore.getMeta('eventLog', []);
                devOutput(log.length ? log.map(e => `${e.t}  [${e.source}] ${e.message}`).join('\n') : 'No events yet.');
                break;
            }
            case 'close':
                toggleDevMenu(false);
                break;
        }
    } catch (error) {
        devOutput(`❌ ${error.message}`);
    }
}

function initDevMenu() {
    if (!devEls.menu) return;

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
            e.preventDefault();
            toggleDevMenu();
        }
    });

    if (devEls.logo) {
        devEls.logo.addEventListener('click', () => {
            const now = Date.now();
            devTapTimes = devTapTimes.filter(t => now - t < DEV_TAP_WINDOW_MS);
            devTapTimes.push(now);
            if (devTapTimes.length >= DEV_TAP_COUNT) {
                devTapTimes = [];
                toggleDevMenu(true);
            }
        });
    }

    devEls.menu.addEventListener('click', (e) => {
        if (e.target === devEls.menu) {
            toggleDevMenu(false);
            return;
        }
        const button = e.target.closest('[data-dev]');
        if (button) runDevAction(button.dataset.dev);
    });
}
