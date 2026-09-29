/**
 * PWA installer - registers the service worker and helps users install the app.
 *
 * - Registers /service-worker.js after the page has loaded (never slows first paint).
 * - Captures `beforeinstallprompt` (Chrome, Edge, Samsung Internet) for a one-tap install.
 * - Shows step-by-step instructions where there is no install prompt (iOS, Safari, Firefox).
 *
 * Put data-install-banner="auto" on <body> to show the install banner automatically.
 * Requires notification-manager.js (for platform detection).
 */
(function () {
    'use strict';

    const DISMISS_KEY = 'pwa_banner_dismissed_until';
    const DISMISS_DAYS = 3;

    const strings = {
        en: {
            installTitle: '📲 Install AGT Todo',
            installText: 'Install the app so alarms can ring even when it is closed.',
            iosText: '📱 Install this app on your home screen to enable alarms',
            install: 'Install',
            howTo: 'How?',
            close: 'Close',
            gotIt: 'Got it',
            installed: '✅ App installed!'
        },
        fr: {
            installTitle: "📲 Installer AGT Todo",
            installText: "Installez l'application pour que les alarmes sonnent même quand elle est fermée.",
            iosText: "📱 Ajoutez l'application à l'écran d'accueil pour activer les alarmes",
            install: 'Installer',
            howTo: 'Comment ?',
            close: 'Fermer',
            gotIt: 'Compris',
            installed: '✅ Application installée !'
        }
    };

    function currentLang() {
        try {
            return localStorage.getItem('app_language') === 'fr' ? 'fr' : 'en';
        } catch (e) {
            return 'en';
        }
    }

    function text(key) {
        return strings[currentLang()][key] || strings.en[key];
    }

    let deferredPrompt = null;
    let registrationPromise = null;

    const platform = () => (window.NotificationManager ? NotificationManager.platform : {
        isIOS: false, isAndroid: false, browser: 'other', isStandalone: () => false
    });

    // ========================================
    // SERVICE WORKER REGISTRATION
    // ========================================

    function register() {
        if (registrationPromise) return registrationPromise;
        if (!('serviceWorker' in navigator)) {
            registrationPromise = Promise.resolve(null);
            return registrationPromise;
        }
        registrationPromise = navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
            .then(registration => {
                console.log(`[PWA ${new Date().toISOString()}] service worker registered (scope ${registration.scope})`);
                return registration;
            })
            .catch(err => {
                console.warn('[PWA] service worker registration failed', err);
                return null;
            });
        return registrationPromise;
    }

    if (document.readyState === 'complete') {
        register();
    } else {
        window.addEventListener('load', register);
    }

    // ========================================
    // INSTALL PROMPT
    // ========================================

    function isInstalled() {
        return platform().isStandalone();
    }

    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredPrompt = event;
        if (document.body && document.body.dataset.installBanner === 'auto') showInstallBanner();
        window.dispatchEvent(new CustomEvent('pwa-installable'));
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        hideInstallBanner();
        if (typeof showToast === 'function') showToast(text('installed'), 'success');
    });

    async function promptInstall() {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const choice = await deferredPrompt.userChoice.catch(() => null);
            deferredPrompt = null;
            if (choice && choice.outcome === 'accepted') hideInstallBanner();
            return choice ? choice.outcome : 'dismissed';
        }
        showInstructions();
        return 'instructions';
    }

    /** Step-by-step install instructions for the current browser. */
    function getInstructions() {
        const p = platform();
        const fr = currentLang() === 'fr';
        if (p.isIOS) {
            return fr ? [
                'Ouvrez cette page dans Safari (iOS 16.4 ou plus récent).',
                'Touchez le bouton Partager ⬆️ en bas de l\'écran.',
                'Choisissez « Sur l\'écran d\'accueil » ➕.',
                'Touchez « Ajouter », puis ouvrez AGT Todo depuis l\'écran d\'accueil.',
                'Dans l\'app, touchez « Activer » pour autoriser les notifications.'
            ] : [
                'Open this page in Safari (iOS 16.4 or newer).',
                'Tap the Share button ⬆️ at the bottom of the screen.',
                'Choose "Add to Home Screen" ➕.',
                'Tap "Add", then open AGT Todo from your Home Screen.',
                'Inside the app, tap "Enable" to allow notifications.'
            ];
        }
        if (p.browser === 'firefox') {
            return p.isAndroid ? [
                'Tap the ⋮ menu.',
                'Tap "Install" (or "Add to Home screen").',
                'Allow notifications when asked.'
            ] : [
                'Firefox on desktop cannot install apps, but alarms still work while Firefox is running.',
                'Allow notifications when asked, and keep Firefox open (no tab needed).'
            ];
        }
        if (p.browser === 'safari') {
            return [
                'In Safari, open the File menu (or the Share button).',
                'Choose "Add to Dock…".',
                'Open AGT Todo from the Dock and allow notifications.'
            ];
        }
        if (p.browser === 'samsung') {
            return ['Tap the ☰ menu.', 'Tap "Add page to" → "Home screen".', 'Allow notifications when asked.'];
        }
        if (p.isAndroid) {
            return ['Tap the ⋮ menu in Chrome.', 'Tap "Install app" (or "Add to Home screen").', 'Allow notifications when asked.'];
        }
        return [
            'Click the install icon (⊕) at the right of the address bar,',
            'or open the ⋮ menu → "Install AGT Todo Suite".',
            'Allow notifications when asked.'
        ];
    }

    // ========================================
    // BANNER + INSTRUCTIONS MODAL
    // ========================================

    function isDismissed() {
        try {
            return Date.now() < parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
        } catch (e) {
            return false;
        }
    }

    /**
     * @param {object} [options]
     * @param {string} [options.message] custom text
     * @param {boolean} [options.persistent] ignore "dismissed" memory (used when alarms can't work otherwise)
     */
    function showInstallBanner(options) {
        options = options || {};
        if (isInstalled()) return;
        if (!options.persistent && isDismissed()) return;
        const canInstallHere = !!deferredPrompt || platform().isIOS || platform().browser === 'safari';
        if (!canInstallHere && !options.persistent) return;

        let banner = document.getElementById('pwaInstallBanner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'pwaInstallBanner';
            banner.className = 'pwa-banner';
            banner.setAttribute('role', 'region');
            banner.setAttribute('aria-label', text('installTitle'));
            document.body.appendChild(banner);
        }

        const message = options.message || (platform().isIOS ? text('iosText') : text('installText'));
        banner.innerHTML = `
            <img class="pwa-banner-icon" src="/assets/icon-192.png" alt="">
            <span class="pwa-banner-text"></span>
            <div class="pwa-banner-actions">
                <button type="button" class="pwa-btn pwa-btn-primary" data-pwa="install">${deferredPrompt ? text('install') : text('howTo')}</button>
                <button type="button" class="pwa-btn pwa-btn-ghost" data-pwa="close" aria-label="${text('close')}">✕</button>
            </div>
        `;
        banner.querySelector('.pwa-banner-text').textContent = message;
        banner.querySelector('[data-pwa="install"]').addEventListener('click', () => promptInstall());
        banner.querySelector('[data-pwa="close"]').addEventListener('click', () => {
            try {
                localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 86400000));
            } catch (e) { /* ignore */ }
            hideInstallBanner();
        });
        banner.classList.add('visible');
    }

    function hideInstallBanner() {
        const banner = document.getElementById('pwaInstallBanner');
        if (banner) banner.remove();
    }

    /** Shows install steps for this browser, or custom `steps` with a custom `title`. */
    function showInstructions(steps, title) {
        const list = Array.isArray(steps) ? steps : getInstructions();
        let modal = document.getElementById('pwaInstructions');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'pwaInstructions';
            modal.className = 'pwa-modal';
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            document.body.appendChild(modal);
            modal.addEventListener('click', (e) => {
                if (e.target === modal || e.target.closest('[data-pwa="close-modal"]')) modal.classList.remove('active');
            });
        }
        modal.innerHTML = `
            <div class="pwa-modal-content">
                <h3></h3>
                <ol class="pwa-steps"></ol>
                <button type="button" class="pwa-btn pwa-btn-primary" data-pwa="close-modal">${text('gotIt')}</button>
            </div>
        `;
        modal.querySelector('h3').textContent = title || text('installTitle');
        const ol = modal.querySelector('.pwa-steps');
        list.forEach(step => {
            const li = document.createElement('li');
            li.textContent = step;
            ol.appendChild(li);
        });
        modal.classList.add('active');
    }

    // Auto banner for pages that opt in (landing page).
    document.addEventListener('DOMContentLoaded', () => {
        if (document.body.dataset.installBanner === 'auto' && platform().isIOS) showInstallBanner();
    });

    window.PWA = {
        register,
        isInstalled,
        canPrompt: () => !!deferredPrompt,
        promptInstall,
        showInstallBanner,
        hideInstallBanner,
        showInstructions,
        getInstructions
    };
})();
