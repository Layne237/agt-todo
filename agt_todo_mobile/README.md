# AGT Todo Suite: mobile app (Flutter)

Native Android/iOS version of [agt-todo.vercel.app](https://agt-todo.vercel.app): the same two modes, the same design and the same alarm rules. On a phone, alarms ring like a real alarm clock, even when the app is closed.

| | |
|---|---|
| App name | AGT Todo Suite |
| Package / bundle id | `com.layne237.todosuite` |
| Version | 1.0.0 (1) |
| Android | min **API 24** (Android 7.0), target/compile **API 36** |
| iOS | 13+ (needs a Mac with Xcode to build) |
| Languages | English, French |
| Flutter | 3.44 (Dart 3.12) |

> **Why API 24 instead of 23?** Flutter 3.44's tooling rewrites any `minSdk` below 24 to 24, so Android 6.0 can't be targeted with this Flutter version. API 24+ covers about 99% of active Android devices.
> **Why target 36 instead of 34?** Google Play rejects apps that target an old API level.

## Features

**Parity with the web app**
- Home page with gradient, floating circles, two mode cards, animated stats, About/Features/Contact, and an EN/FR switcher.
- Classic Todo:
  - add (120 chars), complete, edit (double-tap or ✏️), delete
  - filters All/Active/Completed, Clear Completed, "N tasks remaining"
  - image attachments (2 MB) with a full-screen zoomable viewer
- Programmable Todo:
  - form: title, description, date, time, priority, category, reminder
  - stats, filters All/Upcoming/Overdue/Completed
  - task cards with relative time, due-soon and overdue styling
  - images, edit, delete
- Alarms use the same rules as the web app:
  - a reminder N minutes before, plus the due alarm, each firing once
  - Snooze 5 min, Complete, Dismiss
  - full-screen alarm with a live countdown, "fired at" time, escalating volume and repeating vibration
  - Missed Alarms (more than 15 min late) with Complete / +1 hour / Reschedule
- Status banner and a hidden dev menu (tap the "Programmable Todo" title 5 times).
- Light/dark theme (follows the system until toggled), EN/FR on every screen.

**Native extras**
- 🔔 **Real alarms with the app closed**:
  - each alarm is scheduled with Android's `AlarmManager` (`setAlarmClock`, which bypasses Doze)
  - it plays the alarm sound **in a loop at alarm volume** until you respond
  - it shows **full screen over the lock screen** and vibrates
  - alarms survive reboots and app updates
- ✋ **Snooze / Complete / Dismiss from the notification** without opening the app.
- 📸 **Camera capture** as well as the gallery.
- 📤 **Share** a task (with its photo) to WhatsApp, email, etc.
- 📆 **Add to calendar** (the phone's calendar app).
- 💾 **Offline-first**: everything is stored on the phone (SQLite + app files). No account, no server, no network.

## How alarms work

```
Task saved ──► NotificationService.scheduleTask()
                 └─ zonedSchedule(reminder / due), AndroidScheduleMode.alarmClock
                         │  (app closed, phone locked, after reboot…)
                         ▼
               Android fires the alarm notification
                 • channel "Alarms": res/raw/alarm.wav, USAGE_ALARM, FLAG_INSISTENT (loops)
                 • full-screen intent → app opens on AlarmScreen over the lock screen
                 • actions Snooze / Complete / Dismiss → background isolate updates SQLite
                         ▼
App open ──► AlarmService (5 s check, same rules as the web)
                 • ≤ 15 min late → AlarmScreen rings (escalating volume, vibration)
                 • > 15 min late → Missed Alarms
```

Key files:

| File | Role |
|---|---|
| `lib/utils/alarm_rules.dart` | The alarm rules, ported 1:1 from the web's `shared/js/alarm-store.js` (pure, unit-tested) |
| `lib/services/notification_service.dart` | OS scheduling, channels, permissions, background action handler |
| `lib/services/alarm_service.dart` | In-app ringing, queue, missed alarms, notification taps |
| `lib/services/storage_service.dart` | SQLite. Atomic updates, so the app and the background handler never overwrite each other |
| `lib/screens/alarm_screen.dart` + `lib/widgets/alarm_modal.dart` | Full-screen ringing alarm |

## Permissions the app asks for

| Permission | Why | When |
|---|---|---|
| Notifications (Android 13+, iOS) | Show alarms | When the first Programmable task is created (like the web app), or via the banner's **Enable** button |
| Alarms & reminders (`SCHEDULE_EXACT_ALARM`, Android 12+) | Ring at the exact minute. **Off by default on Android 14+**; without it Android may delay alarms by several minutes | Banner → **Allow** |
| Full-screen alarms (`USE_FULL_SCREEN_INTENT`, Android 14+) | Show the alarm over the lock screen | Banner → **Allow** |
| Ignore battery optimisations (optional) | Some phones (Samsung, Xiaomi, Huawei) delay alarms to save battery | Banner tip |
| Camera / photos / calendar | Only when you use those features | On use |

**Google Play:** declare the full-screen intent and exact alarm use in the Play Console (an app with task alarms qualifies), and fill in the data-safety form. No data leaves the device.

## Develop

```bash
cd agt_todo_mobile
flutter pub get
flutter run                   # on a connected phone or emulator
flutter analyze
flutter test
```

Regenerate assets (icon, splash, notification icon, alarm sound). They're generated from code, using the web app's icon:

```bash
node tool/generate_assets.js
dart run flutter_launcher_icons
dart run flutter_native_splash:create
```

## Build a release

1. Create an upload keystore (once, and keep it safe: Play needs the same key for every update):
   ```bash
   keytool -genkey -v -keystore %USERPROFILE%\agt-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
   ```
2. Create `android/key.properties` (git-ignored):
   ```properties
   storePassword=…
   keyPassword=…
   keyAlias=upload
   storeFile=C:\\Users\\<you>\\agt-upload.jks
   ```
3. Build:
   ```bash
   flutter build apk --release        # build/app/outputs/flutter-apk/app-release.apk
   flutter build appbundle --release  # build/app/outputs/bundle/release/app-release.aab (Play Store)
   ```
   Without `key.properties`, release builds are signed with the debug key. That's fine for testing, but they can't be uploaded to Play.

## Test on a phone

1. Install, open **Programmable Todo**, create a task → allow notifications.
2. Follow the banner until it says 🟢 (Alarms & reminders, full-screen alarms).
3. Dev menu (tap the title 5×) → **Test alarm in 10 seconds** → lock the phone. The alarm should light up the screen, ring in a loop and vibrate.
4. Try **Snooze** from the notification with the app swiped away. It rings again 5 minutes later.
5. Create a task due in 2 minutes, swipe the app away, reboot the phone. The alarm still rings.
6. Switch the phone off past an alarm's time + 15 min, then turn it on and open the app. The alarm is under **Missed Alarms**.

## Known limitations

- **iOS:**
  - no full-screen alarm over the lock screen (Apple doesn't allow it): you get a notification with the default sound
  - custom alarm sounds and Critical Alerts need extra Apple setup/entitlements
  - at most 64 pending notifications
  - the app can't be built or tested on Windows
- **Android battery savers** on some brands can still delay alarms unless the app is exempted (see the banner tip).
- Data is stored on the device only. There's no sync with the web app or between phones.
- Images are stored as files in the app folder (the web uses IndexedDB). Uninstalling the app deletes them.
