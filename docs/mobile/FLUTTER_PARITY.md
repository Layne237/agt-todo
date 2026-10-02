# AGT Todo Suite: Flutter mobile app analysis and feature-parity checklist

Status: **Step 1, analysis.** No Flutter code has been written for this plan yet.
Source analysed: the web app at commit `b1cc5a4` (v3.1.0, with the PWA and background alarms).

---

## 1. Web app as it is today

The structure in the brief is from before v3.1. The current tree also has a service worker, push API and IndexedDB storage:

```
index.html               Landing page (inline CSS + inline EN/FR dictionary)
classic/                 Classic Todo (index.html, css/style.css, js/app.js)
programmable/            Programmable Todo (index.html, css/style.css,
                         js/app.js, js/alarm.js, js/notifications.js, js/dev-menu.js)
shared/css/              common.css (theme tokens), pwa.css
shared/js/               utils.js, alarm-store.js, notification-manager.js,
                         pwa-installer.js, languages.js (loaded by NO page)
service-worker.js, manifest.json, offline.html, api/* (Web Push via QStash)
```

## 2. Screens

### 2.1 Landing (`index.html`)
- Full-screen purple gradient (`#667eea → #764ba2`) with 15 floating translucent circles (random size/position, 10–25 s float animation).
- Hero: badge "⚡ Productivity Suite 2.0", two-line title "Master Your Tasks / Two Powerful Ways", subtitle.
- Two **mode cards** (glass style, hover glow), each with an icon (📝 / ⏰), title, subtitle ("Simple & Fast" / "Smart & Timely"), 6 feature bullets and a "Launch … →" button. Tapping anywhere on the card also navigates.
- Stats row: "Tasks Managed" counts up to 1,247, "Happy Users" shows 500+, "Reminders Sent" counts up to 3,421. **These are hard-coded marketing numbers, not real data.**
- Footer: "🚀 Boost your productivity | Made with ❤️" and About / Features / Contact links, which are dead `#` links.
- Fixed language selector (🇬🇧 English / 🇫🇷 Français), with a toast on change.
- Install banner (PWA). Not needed natively.

### 2.2 Classic Todo
- Nav bar: "📝 Classic Todo", 🏠 Home, ⏰ Programmable Mode, theme toggle 🌙/☀️.
- Input (max **120** chars, placeholder "What needs to be done? (max 120 chars)") and "+ Add" button; Enter also adds. An empty input shows an inline red error for 3 s.
- Filters: **All / Active / Completed**, plus a **Clear Completed** button (confirm "Delete N completed tasks?"; "No completed tasks!" if none).
- List, newest first. Each item has:
  - a checkbox (toggle, completed text struck through)
  - the text (double-tap edits via a prompt; an empty edit gives "Task cannot be empty!")
  - the created date as `📅 dd/MM/yyyy HH:mm`
  - an optional **image thumbnail**: tap for a full-screen modal, ✕ removes it (with confirm)
  - action buttons: 🖼️ attach image (JPEG/PNG/GIF/WebP, **max 2 MB**, spinner while saving), ✏️ edit, 🗑️ delete (with confirm)
- Empty state "📭 No tasks found".
- Footer: "**N** tasks remaining".
- Toasts: "Task added!", "Task deleted", "Task updated", "Image attached!", "Image removed", "Cleared N tasks".

### 2.3 Programmable Todo
- Nav bar: "⏰ Programmable Todo" (tap 5× opens the dev menu), 🏠 Home, 📝 Classic Mode, theme toggle.
- **Alarm status banner**: permission, install and push state, with Enable / Test / How-to buttons.
- **Missed Alarms** section, shown only when non-empty, with a count badge. Each entry has ✅ Complete, ⏰ +1 hour, 📅 Reschedule (inline date-time picker) and ✕ dismiss.
- **Create Smart Task** form:
  - Title * (max 100) and Description (max 300)
  - Due date and Due time (default: now)
  - Priority 🟢 Low / 🟡 **Medium** (default) / 🔴 High
  - Category 💼 Work / 🏠 Personal / 🛒 Shopping / 🏃 Health / 📌 Other
  - Reminder: none / 5 / 10 / 15 / 30 / 60 min before
  - "+ Add Programmable Task". It validates title, date and time, and asks for notification permission on the first task.
- **Stats bar**: 📊 Total, ✅ Completed, ⏰ Upcoming, ⚠️ Overdue.
- **Filters**: All Tasks / Upcoming / Overdue / Completed.
- **Task card**:
  - checkbox, title, description
  - "🖼️ View Attached Image" link
  - meta row: 📅 due date, ⏰ relative time ("in 5 min", "2 hours ago"; highlighted when due within 60 min), priority badge, category, 🔔 reminder
  - buttons: Add/Change Image, Remove image, ✏️ Edit (**title only**), 🗑️ Delete
  - card styling: red left border when overdue, a priority colour border, faded when completed
- **Full-screen alarm modal**: shaking ⏰, "🚨 TASK DUE" or "⏰ REMINDER", title, description, priority, category, due date, live countdown ("Due in 4:32" / "Overdue by 1:05"), "Alarm fired at HH:MM:SS", and the buttons 🔕 Snooze 5 min, ✅ Complete Task, ❌ Dismiss. It can only be closed with a button.
- **Hidden dev menu** (Ctrl+Shift+D or 5 logo taps): test notification, test alarm in 10 s, ring now, SW status, permission info, force sync, event log.
- Empty state: "📭 No tasks found / Create your first programmable task above".

## 3. Theme system
- CSS custom properties on `:root` (light) and overridden by `body.dark-theme` (dark).
- Toggle button in each mode's nav bar. The choice is stored in `localStorage.todo_theme` (`light` | `dark`). If nothing is saved, it follows the OS `prefers-color-scheme`.
- The landing page has its own fixed gradient design and isn't themed.

| Token | Light | Dark |
|---|---|---|
| bg-primary | `#f9f9ff` | `#1e1e2f` |
| bg-secondary | `#ffffff` | `#2a2a3b` |
| text-primary | `#111111` | `#eeeeee` |
| text-secondary | `#666666` | `#a0a0a0` |
| border | `#e0e0e0` | `#3a3a4a` |
| accent / hover | `#6366f1` / `#4f46e5` | same |
| danger / success / warning | `#ef4444` / `#10b981` / `#f59e0b` | same |

Radii are 6/12/16. Spacing is 4/8/16/24/32. The font is the system UI font (`-apple-system, Segoe UI, Inter`).

## 4. Language system
- **Only the landing page is translated.** It has an inline `translations` object (EN/FR) applied to element IDs, and saves the choice in `localStorage.app_language`.
- Classic and Programmable Todo are **English only**. `shared/js/languages.js` has EN/FR keys for them but no page loads it.
- On mobile, translating every screen is therefore **more** than the web app does. That's fine, but it isn't strict parity.

## 5. Data storage

| Data | Web storage | Shape |
|---|---|---|
| Classic tasks | `localStorage.classic_todo_app` | `[{id, text, completed, createdAt, formattedDate, imageId}]` |
| Classic images | IndexedDB `ClassicTodoDB` → `images` | `{id, taskId, data (base64 data URL), type, name}` |
| Programmable tasks | IndexedDB `agt-todo-alarms` → `tasks` (migrated from `localStorage.programmable_todo_app`) | `{id, title, description, dueDateTime, completed, createdAt, priority, category, reminderMinutes, reminderFired, dueFired, snoozedUntil, remindAgainAt, imageId}` |
| Alarm state | IndexedDB `agt-todo-alarms` → `meta` | `missedAlarms`, `eventLog`, push subscription and schedule (web-only) |
| Programmable images | IndexedDB `ProgrammableTodoImages` (v2) → `images` (index `taskId`) | `{id, taskId, data, type, name, size, createdAt}` |
| Theme | `localStorage.todo_theme` | `light` / `dark` / unset = system |
| Language | `localStorage.app_language` | `en` / `fr` |

IDs are `Date.now() + '-' + 8 random base36 chars`. Dates are ISO-8601 strings.
There is **no sync** between devices or between web and mobile. Each install has its own data.

## 6. Notification and alarm logic (Programmable Todo)
- Every task has two possible alarms:
  - **Reminder** at `due − reminderMinutes`. It only fires if that moment comes before the due time.
  - **Due** at `snoozedUntil ?? dueDateTime`.
- Each alarm fires **once**. The `reminderFired` / `dueFired` flags are set atomically.
- **Snooze (5 min):**
  - on a due alarm, `snoozedUntil = now + 5 min` and the due alarm re-arms
  - on a reminder, `remindAgainAt = now + 5 min` if that's still before the due time
- **Complete:** the task is marked done. **Dismiss:** the alarm is silenced and the task stays active.
- **Ringing:** a two-tone 880/660 Hz square-wave chirp every 700 ms. Volume ramps 15 % → 100 % over 10 s. Vibration `[500,200,500,200,500,200,500]` repeats every 3.5 s.
- **Missed:** an alarm noticed more than **15 min** late goes to the Missed Alarms list instead of ringing. On open, a toast says "N tasks were missed while you were away".
- **Background (web):** Web Push scheduled through QStash, plus the service worker. Notification actions are Snooze / Complete / Dismiss, and tapping a notification opens the app on the ringing alarm.
- ⚠️ **"Auto-complete at deadline"** is advertised on the landing page, but the web app **does not do it**: tasks are never completed automatically.

## 7. Features advertised but not implemented on the web
The README and landing page mention these, but there's no code for them: export/import JSON, undo after Clear Completed, keyboard shortcuts (beyond Enter), auto-complete at deadline, calendar integration, and the real "Tasks Managed / Reminders Sent" stats.

## 8. Existing `agt_todo_mobile/` (untracked)
- 3.4k lines of Dart covering home, classic and programmable screens, providers, i18n JSON, and the image/storage/notification services. The package ID is already `com.layne237.todosuite`.
- **Out of date:**
  - Gradle 8.3, AGP 8.2.1, Kotlin 1.9.22 and Java 1.8 are too old for current plugins. For example, `flutter_local_notifications` needs core-library desugaring and Java 17.
- **Broken alarms:**
  - `NotificationService.scheduleNotification` uses `Future.delayed`, so it dies when the app is killed.
  - The model has `reminderSent` but no due/snooze state.
- Its folder layout differs from the requested structure.
- It has no app icon, alarm sound, full-screen intent, exact-alarm permission or boot rescheduling.

## 9. How the mobile app makes alarms real (Android)

| Need | Native approach |
|---|---|
| Alarm fires with the app killed or the phone asleep | `flutter_local_notifications.zonedSchedule` with `AndroidScheduleMode.alarmClock` / `exactAllowWhileIdle`, one per reminder and due alarm. Rescheduled on boot and app update. |
| Rings continuously at alarm volume | Notification channel with a bundled `res/raw/alarm` sound, `AudioAttributesUsage.alarm`, and `FLAG_INSISTENT` (loops until handled). `audioplayers` only plays once the app is in the foreground (alarm screen). |
| Full screen over the lock screen | `fullScreenIntent: true` + `category: alarm`, opening `AlarmScreen` (`showWhenLocked` / `turnScreenOn`). |
| Snooze / Complete / Dismiss from the notification | Notification actions with a background isolate handler that updates sqflite and reschedules. |
| Vibration | Channel vibration pattern, plus the `vibration` package on the alarm screen. |
| Missed alarms | On app open, compare the fired-but-unhandled alarms. Same 15-min rule. |

**Permissions:**
- `POST_NOTIFICATIONS` (Android 13+)
- `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM` (Android 12+)
- `USE_FULL_SCREEN_INTENT` (Android 14+ grants it only to alarm and calling apps, and Play requires a declaration)
- `RECEIVE_BOOT_COMPLETED`, `VIBRATE`, `WAKE_LOCK`, camera

The app should also prompt users to exempt it from battery optimisation (Samsung, Xiaomi).

**iOS limits:**
- no full-screen alarm UI
- notification sounds are capped at 30 s
- at most 64 pending notifications
- "Critical alerts" need a special Apple entitlement
- iOS builds need a Mac with Xcode, so they can't be built on this Windows machine

---

## 10. Feature-parity checklist

### App shell
- [ ] Light/dark theme with the same tokens as the web; persisted; follows the system when unset
- [ ] EN/FR language, persisted, applied to **all** screens
- [ ] Navigation: Home ⇄ Classic ⇄ Programmable, plus the theme toggle on each mode screen
- [ ] App name "AGT Todo Suite", icon (the alarm-clock ✓ from the web), splash screen
- [ ] Portrait + landscape layouts

### Home
- [ ] Gradient background with floating circles animation
- [ ] Hero badge, two-line title, subtitle
- [ ] Two mode cards (icon, title, subtitle, 6 features, launch button; whole card tappable)
- [ ] Animated stats row (decision needed: fake numbers or real counts)
- [ ] Footer text (+ About/Features/Contact: decision needed, they're dead links on the web)
- [ ] Language switcher with a confirmation toast

### Classic Todo
- [ ] Add task (max 120, Enter/submit; empty → inline error 3 s)
- [ ] Toggle complete (strikethrough)
- [ ] Edit (double-tap or ✏️; empty → error)
- [ ] Delete with confirm
- [ ] Filters All / Active / Completed
- [ ] Clear Completed with count confirm ("No completed tasks!" if none)
- [ ] "N tasks remaining" counter
- [ ] Created date `dd/MM/yyyy HH:mm`
- [ ] Attach image (gallery **+ camera**), 2 MB limit, loading state
- [ ] Thumbnail, full-screen zoomable viewer, remove image with confirm
- [ ] Image deleted with its task / when cleared
- [ ] Empty state, toasts (same messages)
- [ ] Persistence across restarts

### Programmable Todo
- [ ] Form: title* (100), description (300), date + time pickers (default now), priority (default medium), category, reminder 0/5/10/15/30/60
- [ ] Validation messages
- [ ] Notification permission asked on the first task
- [ ] Stats bar: Total / Completed / Upcoming / Overdue
- [ ] Filters: All / Upcoming / Overdue / Completed
- [ ] Task card: checkbox, title, description, due date, relative time (due-soon highlight ≤ 60 min), priority badge, category, reminder badge
- [ ] Task card styling: overdue / priority / completed
- [ ] Edit (web: title only, so mobile matches that, or allow a full edit: decision)
- [ ] Delete with confirm
- [ ] Image attach / view / change / remove
- [ ] Alarm model: reminder + due, fire once, snooze rules, dismiss = silence
- [ ] **Alarm with the app closed or locked** (exact scheduled, insistent sound, vibration, full-screen)
- [ ] Alarm screen: kind label, title, description, priority, category, due, live countdown, "fired at", Snooze 5 / Complete / Dismiss, buttons only
- [ ] Escalating volume over 10 s; repeating vibration
- [ ] Notification actions Snooze / Complete / Dismiss work without opening the app
- [ ] Tapping the notification opens the alarm screen
- [ ] Alarms rescheduled after reboot / app update / time-zone change
- [ ] Missed Alarms section (> 15 min late) with Complete / +1 h / Reschedule / dismiss, plus a "N tasks were missed" message
- [ ] Alarm status banner (mobile version: notification permission, exact-alarm permission, full-screen permission, battery optimisation)
- [ ] Hidden dev menu (5 logo taps): test notification, alarm in 10 s, ring now, permission status, pending alarms, event log
- [ ] "Auto-complete at deadline" (**not on the web**: decision)

### Mobile enhancements (beyond parity, phased)
- [ ] Camera capture for images
- [ ] Share a task (share_plus)
- [ ] Add to the phone calendar (add_2_calendar)
- [ ] App shortcuts (long-press icon → Quick add / open a mode)
- [ ] Home-screen widget (home_widget). Needs native Android widget code.
- [ ] Offline-first (true by design, with no network dependency, so bundle the fonts)

### Release
- [ ] Release signing (upload keystore), versioning
- [ ] APK + App Bundle
- [ ] Play Console: target SDK requirement, exact-alarm + full-screen-intent declarations, privacy policy, data-safety form

---

## 11. Problems in the requested spec (to settle before Step 2)

1. **Target SDK 34 can't be published.** Google Play rejects new apps and updates that target an old API level. The requirement was API 35 from Aug 2025 and, by Google's yearly rule, API 36 from Aug 2026. Flutter 3.44 defaults to a current target, and I recommend keeping that. Min SDK 23 is fine.
2. **The two pubspec lists conflict, and several pins are too old for Flutter 3.44:**
   - `workmanager ^0.5.2` doesn't build on current Flutter (it uses the removed v1 embedding). Workmanager also has a **15-min minimum** and is unreliable, so it's the wrong tool for alarms. Exact scheduled notifications do the job; workmanager is at most a daily housekeeping job, or can be dropped.
   - `flutter_local_notifications ^17`, `go_router ^14`, `share_plus ^9` and others are several majors behind. Use the current majors.
   - `hive` + `hive_generator` + `build_runner` duplicate `sqflite` + `shared_preferences`. I recommend sqflite (tasks/images) + shared_preferences (settings) only.
   - `flutter_launcher_icons` and `flutter_native_splash` are dev tools and belong in `dev_dependencies`.
   - `cached_network_image` has nothing to do: there are no network images.
   - `google_fonts` downloads fonts at runtime, which breaks "100 % offline". Bundle the font, or use the system font like the web does.
   - `lottie`, `shimmer` and `flutter_svg` aren't needed for parity.
   - `audioplayers` can't ring with the app killed; the notification channel sound does that.
3. **Full-screen alarms on Android 14+** need the Play Console full-screen-intent declaration. A todo app with alarms usually qualifies, but Google decides.
4. **Repository:** `agt_todo_mobile/` is untracked inside the web repo. "Push after each task" needs a decision on where it lives.
5. **iOS** can be coded but not built or tested from this Windows PC; that needs a Mac. Real-device Android testing is on you, since I can build APKs here but not run them on a phone.
