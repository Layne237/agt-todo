/**
 * NotificationManager - cross-browser notification helpers + platform detection.
 *
 * Notes on browser quirks this hides:
 *  - Android Chrome throws on `new Notification()`; notifications must be shown
 *    through the service worker registration.
 *  - iOS Safari only exposes notifications once the app is installed to the
 *    Home Screen (iOS 16.4+), and the permission prompt must come from a tap.
 *  - Old Safari uses a callback-style requestPermission().
 */
(function () {
    'use strict';

    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(ua);

    function detectBrowser() {
        if (/SamsungBrowser/i.test(ua)) return 'samsung';
        if (/Edg(e|A|iOS)?\//.test(ua)) return 'edge';
        if (/Firefox|FxiOS/.test(ua)) return 'firefox';
        if (/CriOS/.test(ua)) return 'chrome-ios';
        if (/Chrome|Chromium/.test(ua)) return 'chrome';
        if (/Safari/.test(ua)) return 'safari';
        return 'other';
    }

    const platform = {
        isIOS: isIOS,
        isAndroid: isAndroid,
        isMobile: isIOS || isAndroid,
        browser: detectBrowser(),
        isStandalone: () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
    };

    const hasNotificationAPI = 'Notification' in window;
    const supportsServiceWorker = 'serviceWorker' in navigator;
    const supportsPush = supportsServiceWorker && 'PushManager' in window;

    function permission() {
        return hasNotificationAPI ? Notification.permission : 'unsupported';
    }

    /** Must be called from a user gesture (click/tap) - required by Safari and iOS. */
    function requestPermission() {
        if (!hasNotificationAPI) return Promise.resolve('unsupported');
        if (Notification.permission !== 'default') return Promise.resolve(Notification.permission);
        return new Promise(resolve => {
            // Safari < 15 only supports the callback form; newer browsers return a promise.
            const maybePromise = Notification.requestPermission(resolve);
            if (maybePromise && maybePromise.then) maybePromise.then(resolve);
        });
    }

    async function getRegistration() {
        if (!supportsServiceWorker) return null;
        try {
            return (await navigator.serviceWorker.getRegistration()) || null;
        } catch (e) {
            return null;
        }
    }

    /** Shows a notification, preferring the service worker (needed on Android, keeps action buttons). */
    async function show(title, options) {
        if (permission() !== 'granted') return false;
        const registration = await getRegistration();
        if (registration) {
            try {
                await registration.showNotification(title, options);
                return true;
            } catch (e) {
                console.warn('SW notification failed, falling back', e);
            }
        }
        try {
            const plain = Object.assign({}, options);
            delete plain.actions; // not allowed on non-persistent notifications
            const notification = new Notification(title, plain);
            notification.onclick = () => {
                window.focus();
                notification.close();
            };
            return true;
        } catch (e) {
            console.warn('Notification failed', e);
            return false;
        }
    }

    async function closeByTag(tag) {
        const registration = await getRegistration();
        if (!registration || !registration.getNotifications) return;
        const notifications = await registration.getNotifications({ tag: tag });
        notifications.forEach(n => n.close());
    }

    /**
     * What kind of background alarms this browser can do:
     *  'push'          - Web Push available (Chrome, Edge, Firefox, Samsung, Safari macOS, installed iOS app)
     *  'needs-install' - iOS Safari tab: must be added to the Home Screen first
     *  'none'          - no background notifications possible
     */
    function backgroundSupport() {
        if (isIOS && !platform.isStandalone()) return 'needs-install';
        if (supportsPush && hasNotificationAPI) return 'push';
        return 'none';
    }

    window.NotificationManager = {
        platform,
        hasNotificationAPI,
        supportsServiceWorker,
        supportsPush,
        supportsPeriodicSync: supportsServiceWorker && 'periodicSync' in (window.ServiceWorkerRegistration ? ServiceWorkerRegistration.prototype : {}),
        permission,
        requestPermission,
        getRegistration,
        show,
        closeByTag,
        backgroundSupport
    };
})();
