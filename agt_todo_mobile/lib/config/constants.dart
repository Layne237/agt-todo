/// App-wide constants. Values mirror the web app (agt-todo.vercel.app) so both
/// versions behave the same.
class AppConstants {
  AppConstants._();

  static const appName = 'AGT Todo Suite';
  static const appVersion = '1.0.0';
  static const repoUrl = 'https://github.com/layne237/agt-todo';
  static const webUrl = 'https://agt-todo.vercel.app';

  // ---- Limits (same as web) ----
  static const classicMaxLength = 120;
  static const titleMaxLength = 100;
  static const descriptionMaxLength = 300;
  static const maxImageBytes = 2 * 1024 * 1024;

  // ---- Alarm rules (same as web) ----
  static const snoozeMinutes = 5;

  /// An alarm noticed more than this long after its time goes to "Missed Alarms"
  /// instead of ringing.
  static const missedAfter = Duration(minutes: 15);

  /// While the app is open, alarms are also checked on this interval (the OS
  /// scheduled notification covers the time the app is closed).
  static const alarmCheckInterval = Duration(seconds: 5);

  /// In-app ring: volume ramps from this level to 100% over [ringEscalation].
  static const ringStartVolume = 0.15;
  static const ringEscalation = Duration(seconds: 10);

  /// Same pattern as the web app: [wait, vibrate, pause, vibrate, ...] in ms.
  static const vibrationPattern = [0, 500, 200, 500, 200, 500, 200, 500, 1000];

  static const reminderOptions = [0, 5, 10, 15, 30, 60];

  /// Tasks due within this window get the "due soon" highlight.
  static const dueSoonWindow = Duration(minutes: 60);

  // ---- Persistence keys (shared_preferences) ----
  static const themeKey = 'todo_theme'; // 'light' | 'dark' | absent = system
  static const languageKey = 'app_language'; // 'en' | 'fr'
  static const timeZoneKey = 'device_time_zone';

  // ---- Notifications ----
  static const alarmChannelId = 'agt_alarms_v1';
  static const generalChannelId = 'agt_general_v1';
  static const actionSnooze = 'snooze';
  static const actionComplete = 'complete';
  static const actionDismiss = 'dismiss';
}

enum TaskPriority {
  low('🟢'),
  medium('🟡'),
  high('🔴');

  const TaskPriority(this.icon);
  final String icon;

  static TaskPriority parse(String? value) =>
      TaskPriority.values.firstWhere((p) => p.name == value, orElse: () => TaskPriority.medium);
}

enum TaskCategory {
  work('💼'),
  personal('🏠'),
  shopping('🛒'),
  health('🏃'),
  other('📌');

  const TaskCategory(this.icon);
  final String icon;

  static TaskCategory parse(String? value) =>
      TaskCategory.values.firstWhere((c) => c.name == value, orElse: () => TaskCategory.other);
}

enum AlarmKind {
  reminder,
  due,
  test;

  static AlarmKind parse(String? value) =>
      AlarmKind.values.firstWhere((k) => k.name == value, orElse: () => AlarmKind.due);
}
