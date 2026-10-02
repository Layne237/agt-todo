import '../config/constants.dart';

/// A Programmable Todo task. Same fields and alarm flags as the web app
/// (shared/js/alarm-store.js), plus [nid]: a small integer used to derive the
/// Android/iOS notification ids of this task's alarms.
class ProgrammableTask {
  ProgrammableTask({
    required this.id,
    required this.nid,
    required this.title,
    required this.dueDateTime,
    required this.createdAt,
    this.description = '',
    this.completed = false,
    this.priority = TaskPriority.medium,
    this.category = TaskCategory.work,
    this.reminderMinutes = 0,
    this.reminderFired = false,
    this.dueFired = false,
    this.snoozedUntil,
    this.remindAgainAt,
    this.imagePath,
  });

  final String id;
  final int nid;
  final String title;
  final String description;
  final DateTime dueDateTime;
  final bool completed;
  final DateTime createdAt;
  final TaskPriority priority;
  final TaskCategory category;
  final int reminderMinutes;
  final bool reminderFired;
  final bool dueFired;

  /// Set by snoozing the due alarm: the alarm rings at this time instead of [dueDateTime].
  final DateTime? snoozedUntil;

  /// Set by snoozing a reminder: the reminder rings again at this time.
  final DateTime? remindAgainAt;
  final String? imagePath;

  /// Notification ids: one per alarm kind, derived from [nid].
  int notificationId(AlarmKind kind) => nid * 2 + (kind == AlarmKind.reminder ? 0 : 1);

  /// When the due alarm rings (the snoozed time, if any).
  DateTime get effectiveDue => snoozedUntil ?? dueDateTime;

  /// When the reminder rings, or null if there is no reminder.
  DateTime? get reminderTime {
    if (reminderMinutes <= 0) return null;
    return remindAgainAt ?? effectiveDue.subtract(Duration(minutes: reminderMinutes));
  }

  bool isOverdue(DateTime now) => !completed && dueDateTime.isBefore(now);

  bool isDueSoon(DateTime now) {
    final diff = dueDateTime.difference(now);
    return !completed && diff > Duration.zero && diff <= AppConstants.dueSoonWindow;
  }

  ProgrammableTask copyWith({
    String? title,
    String? description,
    DateTime? dueDateTime,
    bool? completed,
    TaskPriority? priority,
    TaskCategory? category,
    int? reminderMinutes,
    bool? reminderFired,
    bool? dueFired,
    DateTime? snoozedUntil,
    bool clearSnooze = false,
    DateTime? remindAgainAt,
    bool clearRemindAgain = false,
    String? imagePath,
    bool clearImage = false,
  }) =>
      ProgrammableTask(
        id: id,
        nid: nid,
        title: title ?? this.title,
        description: description ?? this.description,
        dueDateTime: dueDateTime ?? this.dueDateTime,
        completed: completed ?? this.completed,
        createdAt: createdAt,
        priority: priority ?? this.priority,
        category: category ?? this.category,
        reminderMinutes: reminderMinutes ?? this.reminderMinutes,
        reminderFired: reminderFired ?? this.reminderFired,
        dueFired: dueFired ?? this.dueFired,
        snoozedUntil: clearSnooze ? null : (snoozedUntil ?? this.snoozedUntil),
        remindAgainAt: clearRemindAgain ? null : (remindAgainAt ?? this.remindAgainAt),
        imagePath: clearImage ? null : (imagePath ?? this.imagePath),
      );

  Map<String, Object?> toMap() => {
        'id': id,
        'nid': nid,
        'title': title,
        'description': description,
        'due_date_time': dueDateTime.toIso8601String(),
        'completed': completed ? 1 : 0,
        'created_at': createdAt.toIso8601String(),
        'priority': priority.name,
        'category': category.name,
        'reminder_minutes': reminderMinutes,
        'reminder_fired': reminderFired ? 1 : 0,
        'due_fired': dueFired ? 1 : 0,
        'snoozed_until': snoozedUntil?.toIso8601String(),
        'remind_again_at': remindAgainAt?.toIso8601String(),
        'image_path': imagePath,
      };

  factory ProgrammableTask.fromMap(Map<String, Object?> map) => ProgrammableTask(
        id: map['id'] as String,
        nid: map['nid'] as int,
        title: map['title'] as String,
        description: map['description'] as String? ?? '',
        dueDateTime: DateTime.parse(map['due_date_time'] as String),
        completed: (map['completed'] as int? ?? 0) == 1,
        createdAt: DateTime.parse(map['created_at'] as String),
        priority: TaskPriority.parse(map['priority'] as String?),
        category: TaskCategory.parse(map['category'] as String?),
        reminderMinutes: map['reminder_minutes'] as int? ?? 0,
        reminderFired: (map['reminder_fired'] as int? ?? 0) == 1,
        dueFired: (map['due_fired'] as int? ?? 0) == 1,
        snoozedUntil: _date(map['snoozed_until']),
        remindAgainAt: _date(map['remind_again_at']),
        imagePath: map['image_path'] as String?,
      );

  static DateTime? _date(Object? value) => value is String ? DateTime.parse(value) : null;
}

/// An alarm moment of a task (reminder or due).
class PendingAlarm {
  const PendingAlarm(this.task, this.kind, this.at);
  final ProgrammableTask task;
  final AlarmKind kind;
  final DateTime at;
}

/// An alarm that went off while the user was away (web: "Missed Alarms").
class MissedAlarm {
  const MissedAlarm({required this.taskId, required this.kind, required this.at, required this.firedAt});

  final String taskId;
  final AlarmKind kind;
  final DateTime at;
  final DateTime firedAt;

  Map<String, Object?> toMap() => {
        'task_id': taskId,
        'kind': kind.name,
        'at': at.toIso8601String(),
        'fired_at': firedAt.toIso8601String(),
      };

  factory MissedAlarm.fromMap(Map<String, Object?> map) => MissedAlarm(
        taskId: map['task_id'] as String,
        kind: AlarmKind.parse(map['kind'] as String?),
        at: DateTime.parse(map['at'] as String),
        firedAt: DateTime.parse(map['fired_at'] as String),
      );
}
