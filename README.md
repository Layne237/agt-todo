# 📝 AGT-Todo - Modern Todo List Application

[![GitHub Pages](https://img.shields.io/badge/GitHub-Pages-blue)](https://yourusername.github.io/agt-todo)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6-yellow)]()

A feature-rich, responsive Todo List web application built with vanilla HTML, CSS, and JavaScript. No frameworks, no dependencies - just pure web technologies.

## ✨ Features

### Core Features
- ✅ **Create tasks** with 120 character limit
- ✅ **Read tasks** with persistent localStorage storage
- ✅ **Update tasks** via inline edit (double-click or edit button)
- ✅ **Delete tasks** with confirmation dialog
- ✅ **Mark complete/incomplete** with visual feedback

### Advanced Features
- 🎯 **Smart filtering** (All / Active / Completed)
- 🌓 **Dark/Light theme** with system preference detection
- 💾 **Export/Import** tasks as JSON backup
- ⌨️ **Keyboard shortcuts** for power users
- ↩️ **Undo** after clearing completed tasks
- 📱 **Fully responsive** (Mobile, Tablet, Desktop)
- 🎨 **Smooth animations** and transitions
- 📊 **Real-time counter** with title badge

### Technical Features
- 💿 **LocalStorage persistence** - tasks survive page reload
- 🔒 **Input validation** and error handling
- ♿ **Accessibility** ready (ARIA labels, keyboard navigation)
- 🚀 **Optimized performance** (< 50ms DOM updates)
- 📦 **Zero dependencies** - vanilla JavaScript only

## 🎯 Demo

Live demo: [https://agt-todo.vercel.app](https://agt-todo.vercel.app)

![Todo App Screenshot](assets/screenshot.png)
*(Add screenshot after deployment)*

## 🚀 Quick Start

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/layne237/agt-todo.git
   cd agt-todo
   npm install
   npm run dev        # http://localhost:3000 - static site + API + local QStash emulator
   ```

2. **Run the tests**
   ```bash
   npm test
   ```

---

## ⏰ Background alarms (PWA + Web Push)

Programmable Todo alarms ring **even when the app is closed**, the browser is minimised or the phone is locked. That works through three pieces:

```
 Your device                                   Vercel (/api)                    Upstash QStash
 ───────────                                   ─────────────                    ──────────────
 Task saved ──► app syncs upcoming alarms ───► /api/schedule ─────────────────► waits until the alarm time
                (endpoint + task id + time)                                           │
                                                /api/fire ◄──── signed call ◄─────────┘
                                                    │ encrypted Web Push (urgency: high)
 service worker wakes up ◄── browser push service ◄─┘
   ├─ reads the task from IndexedDB (titles never leave the device)
   ├─ shows the notification (lock screen, vibration, sound)
   └─ Snooze / Complete / Dismiss work straight from the notification
```

Fallbacks, in order:
1. **Web Push**: the reliable path described above.
2. **Periodic Background Sync**: Chrome/Edge installed apps only, best effort (the browser decides, often every ~12 h).
3. **The service worker checks for due tasks whenever it wakes up** for any reason.
4. **The in-page checker** runs every 5 s while the app is open.
5. **Missed Alarms**: anything that went off while you were away is listed when you open the app, with ✅ Complete / ⏰ +1 hour / 📅 Reschedule.

### 📲 How to install for background alarms

| Device | Steps |
|---|---|
| **Android: Chrome / Edge** | Open the site, tap ⋮ → **Install app**, open it from the home screen and tap **Enable** for notifications. Then set *App info → Battery → Unrestricted* for the browser so alarms aren't delayed. |
| **Android: Samsung Internet** | ☰ → **Add page to → Home screen**, then allow notifications. |
| **iPhone / iPad (iOS 16.4+)** | In **Safari**, tap Share ⬆️ → **Add to Home Screen** → Add. Open **AGT Todo from the home screen** and tap **Enable**. *Notifications cannot work in a normal Safari tab on iOS.* |
| **Windows / macOS / Linux: Chrome or Edge** | Click the install icon (⊕) in the address bar, or ⋮ → *Install AGT Todo Suite*, then allow notifications. |
| **macOS Safari 16+** | File → **Add to Dock…**, then allow notifications. |
| **Firefox (desktop)** | No install needed: allow notifications. Alarms arrive while Firefox is running, even with no tab open. |

The app shows a status banner at the top of Programmable Todo that says what works in the current browser and what to do next.

### 🔧 Server setup (one time, free)

1. **Generate VAPID keys** (they identify your server to the push services):
   ```bash
   npx web-push generate-vapid-keys
   ```
2. **Create a free Upstash account** at <https://console.upstash.com>, open **QStash**, and copy the `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY`. If the console shows a region-specific `QSTASH_URL`, copy that too.
3. In **Vercel → Project → Settings → Environment Variables**, add:

   | Variable | Value |
   |---|---|
   | `VAPID_PUBLIC_KEY` | public key from step 1 |
   | `VAPID_PRIVATE_KEY` | private key from step 1 (keep it secret) |
   | `VAPID_SUBJECT` | `mailto:you@example.com` |
   | `QSTASH_TOKEN` | from Upstash |
   | `QSTASH_CURRENT_SIGNING_KEY` | from Upstash |
   | `QSTASH_NEXT_SIGNING_KEY` | from Upstash |
   | `QSTASH_URL` *(optional)* | only if Upstash shows a regional URL |
   | `APP_URL` *(optional)* | `https://agt-todo.vercel.app` (auto-detected otherwise) |
   | `QSTASH_MAX_DELAY_DAYS` *(optional)* | default `7` (QStash free-tier limit) |

4. **Redeploy.** Open Programmable Todo; the banner should say *🟢 Background alarms are on*.

Without these variables the app still works: alarms ring while the page is open, and missed ones are listed when you come back. The banner then says background push isn't set up.

**Privacy:** the server only ever sees the push endpoint, an opaque task id, the alarm kind and the time. Task titles, descriptions and images stay on your device. The push payload is end-to-end encrypted to your device.

### 🧪 Testing instructions

**Hidden dev menu:** press **Ctrl+Shift+D**, or tap the "⏰ Programmable Todo" logo **5 times**.

| Button | What it checks |
|---|---|
| 🔔 Test background notification | The service worker can show notifications |
| ⏱️ Test alarm in 10 seconds | The full server path: schedules a real push. **Close the app / lock the phone right after tapping.** |
| 🚨 Ring in-page alarm now | Full-screen modal, escalating sound, vibration |
| ⚙️ Service worker status | Version, caches, push subscription, scheduled pushes, last sync, SW event log |
| 🔐 Check notification permission | Permission, platform, install state, push/periodic-sync support |
| 🔄 Force sync now | Runs the background check and re-syncs the push schedule |
| 📜 Alarm event log | Timestamped log of alarm events from the page **and** the service worker |

**Step-by-step verification (per browser):**

1. **Chrome/Edge desktop:** enable notifications → dev menu → *Test alarm in 10 seconds* → close the tab (keep the browser running) → a notification appears with Snooze/Complete. Click it: the app opens on the ringing alarm.
2. **Android (installed):** create a task due in 2 minutes → swipe the app away → lock the phone → the notification shows on the lock screen and vibrates. Try **Snooze**: it rings again 5 min later.
3. **iOS (installed from Home Screen):** same as Android. Expect no vibration pattern and no action buttons (iOS limits); tapping opens the app on the alarm.
4. **Firefox:** enable notifications → *Test alarm in 10 seconds* → close the tab → notification arrives.
5. **Missed alarms:** turn the phone's data off, let a task become due, turn data back on after 20+ min, open the app → *Missed Alarms* lists it.
6. **Classic Todo:** add, complete and delete a task, and attach an image. Nothing there changed.

**Automated tests:** `npm test` covers the alarm rules, the atomic "fire once" logic, snooze, missed alarms, push-schedule syncing, and QStash signature verification.

**Local end-to-end:** `npm run dev` runs everything on `http://localhost:3000` with an in-memory QStash emulator (no accounts needed). Pushes still go through your browser's real push service, so you need internet.

### ⚠️ Known limitations (the web platform, not this app)

- **No true "alarm clock" takeover.** A closed web app can't ring a looping ringtone full-screen over the lock screen. It shows a system notification with the default notification sound and vibration; tapping it opens the full-screen ringing alarm. A native app (e.g. the Flutter version) is needed for Samsung-Clock-style behaviour.
- **iOS:** only works when installed to the Home Screen (iOS 16.4+). No custom vibration, no action buttons. The permission prompt must come from a tap (the *Enable* button).
- **Chrome shows at most 2 action buttons** (Snooze, Complete). Swipe the notification away to dismiss.
- **Android battery savers** (especially Samsung, Xiaomi, Huawei) can delay pushes or kill the browser. Set the browser/app battery usage to *Unrestricted*.
- **Desktop:** the browser has to be running (it may run in the background with no windows).
- **Alarms more than 7 days away** are handed to the server once they come within 7 days, whenever the app or the service worker next syncs (opening the app, any alarm firing, periodic sync). Open the app at least once a week if you schedule far ahead. (Paid QStash plans allow longer delays: set `QSTASH_MAX_DELAY_DAYS`.)
- **Periodic Background Sync** only exists in Chrome/Edge for installed apps, and the browser decides how often it runs.
- The alarm sound is synthesised with the Web Audio API in the open app. Browsers don't allow custom sounds for notifications.

### 💡 Possible improvements

- Wrap the web app in the Flutter/Capacitor shell for exact native alarms (Android `AlarmManager` + full-screen intent).
- Pick your own snooze length and ringtone, per task.
- Recurring tasks (daily/weekly), scheduled with the same push pipeline.
- Sync tasks across devices (would need an account and a database, which is a privacy trade-off).

### 🔢 Versioning / cache invalidation

`APP_VERSION` at the top of `service-worker.js` names the caches. **Bump it on every deploy that changes HTML/CSS/JS**, so old caches are deleted and users get the new files. The service worker itself is served with `Cache-Control: no-cache` (see `vercel.json`), so browsers always pick up a new version.
