import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/data/latest_all.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

import '../config/constants.dart';
import '../models/programmable_task.dart';
import '../utils/alarm_rules.dart';
import 'storage_service.dart';

/// What a notification carries, so a tap or an action knows which alarm it is.
class AlarmPayload {
  const AlarmPayload({required this.taskId, required this.kind, required this.at});

  final String taskId;
  final AlarmKind kind;
  final DateTime at;

  String encode() => jsonEncode({'taskId': taskId, 'kind': kind.name, 'at': at.millisecondsSinceEpoch});

  static AlarmPayload? decode(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      return AlarmPayload(
        taskId: map['taskId'] as String,
        kind: AlarmKind.parse(map['kind'] as String?),
        at: DateTime.fromMillisecondsSinceEpoch(map['at'] as int),
      );
    } catch (_) {
      return null;
    }
  }
}

/// Snapshot of everything the alarm status banner needs.
class AlarmPermissions {
  const AlarmPermissions({
    required this.notifications,
    required this.notificationsPermanentlyDenied,
    required this.exactAlarms,
    required this.fullScreen,
    required this.batteryUnrestricted,
  });

  final bool notifications;
  final bool notificationsPermanentlyDenied;
  final bool exactAlarms;
  final bool fullScreen;
  final bool batteryUnrestricted;

  bool get allGood => notifications && exactAlarms && fullScreen;

  Map<String, Object> toJson() => {
        'notifications': notifications,
        'notificationsPermanentlyDenied': notificationsPermanentlyDenied,
        'exactAlarms': exactAlarms,
        'fullScreen': fullScreen,
        'batteryUnrestricted': batteryUnrestricted,
      };
}

/// Notification texts, read straight from the translation JSON so they also
/// work in the background isolate (where easy_localization isn't running).
class AlarmTexts {
  AlarmTexts._(this._strings);
  final Map<String, dynamic> _strings;

  static Future<AlarmTexts> load() async {
    final lang = (await SharedPreferences.getInstance()).getString(AppConstants.languageKey) ?? 'en';
    final json = await rootBundle.loadString('assets/translations/${lang == 'fr' ? 'fr' : 'en'}.json');
    return AlarmTexts._(jsonDecode(json) as Map<String, dynamic>);
  }

  String _get(String path, [List<String> args = const []]) {
    Object? node = _strings;
    for (final part in path.split('.')) {
      node = node is Map<String, dynamic> ? node[part] : null;
    }
    var text = node is String ? node : path;
    for (final arg in args) {
      text = text.replaceFirst('{}', arg);
    }
    return text;
  }

  String priority(TaskPriority p) => _get('prog.priorities.${p.name}');
  String title(ProgrammableTask task, AlarmKind kind) =>
      _get(kind == AlarmKind.reminder ? 'alarm.notifReminderTitle' : 'alarm.notifDueTitle', [task.title]);

  String body(ProgrammableTask task, AlarmKind kind) {
    final prio = '${task.priority.icon} ${priority(task.priority)}';
    if (kind == AlarmKind.reminder) {
      final minutes = task.effectiveDue.difference(task.reminderTime ?? task.effectiveDue).inMinutes;
      return _get('alarm.notifReminderBody', ['$minutes', prio]);
    }
    return _get('alarm.notifDueBody', [prio]);
  }

  String get snooze => _get('alarm.actionSnooze');
  String get complete => _get('alarm.actionComplete');
  String get dismiss => _get('alarm.actionDismiss');
  String get channelName => _get('alarm.channelName');
  String get channelDescription => _get('alarm.channelDescription');
  String get generalChannelName => _get('alarm.generalChannelName');
  String get testTitle => _get('alarm.testTitle');
  String get testDescription => _get('alarm.testDescription');
}

/// Schedules alarms with the OS so they ring even when the app is closed,
/// the phone is locked, or it was rebooted (flutter_local_notifications'
/// boot receiver restores them).
///
/// Android: exact `alarmClock` schedule, alarm-volume channel sound that loops
/// (FLAG_INSISTENT) until the user responds, full-screen intent over the lock
/// screen, and Snooze / Complete / Dismiss action buttons.
class NotificationService {
  NotificationService._();
  static final NotificationService instance = NotificationService._();

  static const _systemChannel = MethodChannel('agt_todo/system');
  static const _iosCategory = 'agt_alarm';
  static const _insistentFlag = 4; // android.app.Notification.FLAG_INSISTENT
  static const testNotificationId = 999999;

  final FlutterLocalNotificationsPlugin plugin = FlutterLocalNotificationsPlugin();
  AlarmTexts? _texts;

  Future<AlarmTexts> get texts async => _texts ??= await AlarmTexts.load();

  /// Reloads notification texts after a language change.
  Future<void> reloadTexts() async => _texts = await AlarmTexts.load();

  // ========================================
  // INIT
  // ========================================

  static bool _tzReady = false;

  /// Sets tz.local to the device time zone (needed to schedule at the right wall-clock time).
  static Future<void> initTimeZone() async {
    if (_tzReady) return;
    tz_data.initializeTimeZones();
    final prefs = await SharedPreferences.getInstance();
    String? name;
    try {
      name = (await FlutterTimezone.getLocalTimezone()).identifier;
      await prefs.setString(AppConstants.timeZoneKey, name);
    } catch (_) {
      name = prefs.getString(AppConstants.timeZoneKey);
    }
    try {
      tz.setLocalLocation(tz.getLocation(name ?? 'UTC'));
    } catch (_) {
      tz.setLocalLocation(tz.UTC);
    }
    _tzReady = true;
  }

  /// Main-isolate initialisation. [onResponse] handles taps/actions while the app runs.
  Future<void> init({required void Function(NotificationResponse) onResponse}) async {
    await initTimeZone();
    final t = await texts;
    await plugin.initialize(
      settings: InitializationSettings(
        android: const AndroidInitializationSettings('ic_stat_alarm'),
        iOS: DarwinInitializationSettings(
          // Asked explicitly on the first task, like the web app.
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
          notificationCategories: [
            DarwinNotificationCategory(
              _iosCategory,
              actions: [
                DarwinNotificationAction.plain(AppConstants.actionSnooze, t.snooze),
                DarwinNotificationAction.plain(AppConstants.actionComplete, t.complete),
                DarwinNotificationAction.plain(AppConstants.actionDismiss, t.dismiss,
                    options: {DarwinNotificationActionOption.destructive}),
              ],
            ),
          ],
        ),
      ),
      onDidReceiveNotificationResponse: onResponse,
      onDidReceiveBackgroundNotificationResponse: onBackgroundNotificationResponse,
    );
    await _createChannels(t);
  }

  Future<void> _createChannels(AlarmTexts t) async {
    final android = plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    if (android == null) return;
    // Channel settings are fixed once created: bump the id in AppConstants to change them.
    await android.createNotificationChannel(AndroidNotificationChannel(
      AppConstants.alarmChannelId,
      t.channelName,
      description: t.channelDescription,
      importance: Importance.max,
      sound: const RawResourceAndroidNotificationSound('alarm'),
      audioAttributesUsage: AudioAttributesUsage.alarm,
      vibrationPattern: Int64List.fromList(AppConstants.vibrationPattern),
      bypassDnd: true,
    ));
    await android.createNotificationChannel(AndroidNotificationChannel(
      AppConstants.generalChannelId,
      t.generalChannelName,
      importance: Importance.high,
    ));
  }

  /// If the app was started by tapping a notification (or by a full-screen alarm), its payload.
  Future<NotificationResponse?> launchResponse() async {
    final details = await plugin.getNotificationAppLaunchDetails();
    if (details == null || !details.didNotificationLaunchApp) return null;
    return details.notificationResponse;
  }

  // ========================================
  // PERMISSIONS
  // ========================================

  Future<AlarmPermissions> permissions() async {
    final notification = await Permission.notification.status;
    var exact = true;
    var fullScreen = true;
    var battery = true;
    if (Platform.isAndroid) {
      final android = plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      exact = await android?.canScheduleExactNotifications() ?? true;
      try {
        fullScreen = await _systemChannel.invokeMethod<bool>('canUseFullScreenIntent') ?? true;
      } catch (_) {}
      battery = await Permission.ignoreBatteryOptimizations.isGranted;
    }
    return AlarmPermissions(
      notifications: notification.isGranted || notification.isProvisional,
      notificationsPermanentlyDenied: notification.isPermanentlyDenied,
      exactAlarms: exact,
      fullScreen: fullScreen,
      batteryUnrestricted: battery,
    );
  }

  Future<bool> requestNotifications() async {
    if (Platform.isAndroid) {
      final android = plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      return await android?.requestNotificationsPermission() ?? false;
    }
    final ios = plugin.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>();
    return await ios?.requestPermissions(alert: true, badge: true, sound: true) ?? false;
  }

  Future<void> requestExactAlarms() async {
    await plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()?.requestExactAlarmsPermission();
  }

  Future<void> requestFullScreen() async {
    await plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()?.requestFullScreenIntentPermission();
  }

  Future<void> requestBatteryExemption() async {
    await Permission.ignoreBatteryOptimizations.request();
  }

  // ========================================
  // SCHEDULING
  // ========================================

  Future<NotificationDetails> _alarmDetails() async {
    final t = await texts;
    return NotificationDetails(
      android: AndroidNotificationDetails(
        AppConstants.alarmChannelId,
        t.channelName,
        channelDescription: t.channelDescription,
        icon: 'ic_stat_alarm',
        importance: Importance.max,
        priority: Priority.max,
        category: AndroidNotificationCategory.alarm,
        fullScreenIntent: true,
        visibility: NotificationVisibility.public,
        sound: const RawResourceAndroidNotificationSound('alarm'),
        audioAttributesUsage: AudioAttributesUsage.alarm,
        vibrationPattern: Int64List.fromList(AppConstants.vibrationPattern),
        // Loop the sound until the user responds, like a real alarm clock.
        additionalFlags: Int32List.fromList([_insistentFlag]),
        autoCancel: true,
        color: const Color(0xFF6366F1),
        actions: [
          AndroidNotificationAction(AppConstants.actionSnooze, t.snooze),
          AndroidNotificationAction(AppConstants.actionComplete, t.complete),
          AndroidNotificationAction(AppConstants.actionDismiss, t.dismiss),
        ],
      ),
      iOS: const DarwinNotificationDetails(
        presentAlert: true,
        presentSound: true,
        presentBanner: true,
        presentList: true,
        categoryIdentifier: _iosCategory,
        interruptionLevel: InterruptionLevel.timeSensitive,
      ),
    );
  }

  Future<AndroidScheduleMode> _scheduleMode() async {
    if (!Platform.isAndroid) return AndroidScheduleMode.exactAllowWhileIdle;
    final android = plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    final exact = await android?.canScheduleExactNotifications() ?? false;
    // alarmClock is exempt from Doze and shows the alarm icon in the status bar.
    // Without the exact-alarm permission Android may delay the alarm by a few minutes.
    return exact ? AndroidScheduleMode.alarmClock : AndroidScheduleMode.inexactAllowWhileIdle;
  }

  /// Cancels and re-creates the OS alarms of one task (reminder + due).
  Future<void> scheduleTask(ProgrammableTask task) async {
    await cancelTask(task);
    final now = DateTime.now();
    final upcoming = AlarmRules.pendingAlarms(task).where((a) => a.at.isAfter(now)).toList();
    if (upcoming.isEmpty) return;

    final details = await _alarmDetails();
    final mode = await _scheduleMode();
    final t = await texts;
    for (final alarm in upcoming) {
      await plugin.zonedSchedule(
        id: task.notificationId(alarm.kind),
        scheduledDate: tz.TZDateTime.from(alarm.at, tz.local),
        notificationDetails: details,
        androidScheduleMode: mode,
        title: t.title(task, alarm.kind),
        body: t.body(task, alarm.kind),
        payload: AlarmPayload(taskId: task.id, kind: alarm.kind, at: alarm.at).encode(),
      );
    }
  }

  Future<void> cancelTask(ProgrammableTask task) async {
    await plugin.cancel(id: task.notificationId(AlarmKind.reminder));
    await plugin.cancel(id: task.notificationId(AlarmKind.due));
  }

  /// Stops a ringing (shown) alarm notification, e.g. when the in-app alarm screen takes over.
  Future<void> cancelShown(ProgrammableTask task, AlarmKind kind) => plugin.cancel(id: task.notificationId(kind));

  /// Re-creates every OS alarm from the database (app start, permission granted, language changed).
  Future<void> rescheduleAll(List<ProgrammableTask> tasks) async {
    await plugin.cancelAllPendingNotifications();
    for (final task in tasks) {
      await scheduleTask(task);
    }
  }

  Future<List<PendingNotificationRequest>> pending() => plugin.pendingNotificationRequests();

  // ========================================
  // TESTS (status banner + dev menu)
  // ========================================

  Future<void> showTest() async {
    final t = await texts;
    await plugin.show(
      id: testNotificationId,
      title: '🔔 ${t.testTitle}',
      body: t.testDescription,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          AppConstants.generalChannelId,
          t.generalChannelName,
          icon: 'ic_stat_alarm',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: const DarwinNotificationDetails(presentAlert: true, presentSound: true, presentBanner: true),
      ),
      payload: AlarmPayload(taskId: '__test__', kind: AlarmKind.test, at: DateTime.now()).encode(),
    );
  }

  /// A real alarm (same channel, full screen, actions) in [delay] - lock the phone to test.
  Future<void> scheduleTestAlarm(Duration delay) async {
    final t = await texts;
    final at = DateTime.now().add(delay);
    await plugin.zonedSchedule(
      id: testNotificationId,
      scheduledDate: tz.TZDateTime.from(at, tz.local),
      notificationDetails: await _alarmDetails(),
      androidScheduleMode: await _scheduleMode(),
      title: '🧪 ${t.testTitle}',
      body: t.testDescription,
      payload: AlarmPayload(taskId: '__test__', kind: AlarmKind.test, at: at).encode(),
    );
  }
}

// ========================================
// NOTIFICATION ACTIONS (shared by the app and the background isolate)
// ========================================

/// Applies Snooze / Complete / Dismiss chosen on a notification.
/// Returns true if task data changed.
Future<bool> applyNotificationAction(String actionId, AlarmPayload payload, {required String source}) async {
  if (payload.kind == AlarmKind.test) return false;
  final storage = StorageService.instance;
  final notifications = NotificationService.instance;
  final now = DateTime.now();

  // The OS rang this alarm; record it as fired before applying the choice.
  ProgrammableTask markFired(ProgrammableTask t) =>
      payload.kind == AlarmKind.reminder ? t.copyWith(reminderFired: true, clearRemindAgain: true) : t.copyWith(dueFired: true);

  ProgrammableTask? updated;
  switch (actionId) {
    case AppConstants.actionComplete:
      updated = await storage.updateProgrammableTask(payload.taskId, (t) => markFired(t).copyWith(completed: true));
      if (updated != null) await notifications.cancelTask(updated);
    case AppConstants.actionSnooze:
      updated = await storage.updateProgrammableTask(payload.taskId, (t) => AlarmRules.snooze(markFired(t), payload.kind, now));
      if (updated != null) await notifications.scheduleTask(updated);
    case AppConstants.actionDismiss:
      updated = await storage.updateProgrammableTask(payload.taskId, markFired);
    default:
      return false;
  }
  await storage.removeMissedAlarms(payload.taskId);
  await storage.log(source, '$actionId ${payload.kind.name} for ${payload.taskId} from notification');
  return updated != null;
}

/// Runs in a background isolate when an action button is pressed while the app is closed.
@pragma('vm:entry-point')
Future<void> onBackgroundNotificationResponse(NotificationResponse response) async {
  WidgetsFlutterBinding.ensureInitialized();
  final payload = AlarmPayload.decode(response.payload);
  final actionId = response.actionId;
  if (payload == null || actionId == null) return;
  // Do NOT call plugin.initialize() here: it would replace the main isolate's handlers.
  await NotificationService.initTimeZone();
  await applyNotificationAction(actionId, payload, source: 'Background');
}
