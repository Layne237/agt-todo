import 'dart:async';

import 'package:flutter/foundation.dart';

import '../config/constants.dart';
import '../models/programmable_task.dart';
import '../services/alarm_service.dart';
import '../services/image_service.dart';
import '../services/notification_service.dart';
import '../services/storage_service.dart';
import '../utils/alarm_rules.dart';
import '../utils/helpers.dart';

enum ProgrammableFilter { all, upcoming, overdue, completed }

/// Programmable Todo state: tasks, stats, filters, missed alarms. Every change
/// re-schedules the task's OS alarms, so they ring even when the app is closed.
class ProgrammableTodoProvider extends ChangeNotifier {
  ProgrammableTodoProvider({
    StorageService? storage,
    NotificationService? notifications,
    ImageService? images,
    AlarmService? alarms,
  })  : _storage = storage ?? StorageService.instance,
        _notifications = notifications ?? NotificationService.instance,
        _images = images ?? ImageService.instance,
        _alarms = alarms ?? AlarmService.instance {
    _subscription = _alarms.tasksChanged.listen((_) => load());
  }

  final StorageService _storage;
  final NotificationService _notifications;
  final ImageService _images;
  final AlarmService _alarms;
  StreamSubscription<void>? _subscription;

  List<ProgrammableTask> _tasks = [];
  List<MissedAlarm> _missed = [];
  ProgrammableFilter _filter = ProgrammableFilter.all;
  bool _loaded = false;
  String? _uploadingTaskId;

  bool get loaded => _loaded;
  ProgrammableFilter get filter => _filter;
  String? get uploadingTaskId => _uploadingTaskId;
  List<ProgrammableTask> get allTasks => List.unmodifiable(_tasks);

  /// Missed alarms whose task still exists and is open.
  List<(MissedAlarm, ProgrammableTask)> get missed => [
        for (final m in _missed)
          if (_find(m.taskId) case final task? when !task.completed) (m, task),
      ];

  List<ProgrammableTask> get tasks {
    final now = DateTime.now();
    return switch (_filter) {
      ProgrammableFilter.upcoming => _tasks.where((t) => !t.completed && !t.isOverdue(now)).toList(),
      ProgrammableFilter.overdue => _tasks.where((t) => t.isOverdue(now)).toList(),
      ProgrammableFilter.completed => _tasks.where((t) => t.completed).toList(),
      ProgrammableFilter.all => List.unmodifiable(_tasks),
    };
  }

  ({int total, int completed, int upcoming, int overdue}) get stats {
    final now = DateTime.now();
    return (
      total: _tasks.length,
      completed: _tasks.where((t) => t.completed).length,
      upcoming: _tasks.where((t) => !t.completed && !t.isOverdue(now)).length,
      overdue: _tasks.where((t) => t.isOverdue(now)).length,
    );
  }

  Future<void> load() async {
    _tasks = await _storage.getProgrammableTasks();
    _missed = await _storage.getMissedAlarms();
    _loaded = true;
    notifyListeners();
  }

  void setFilter(ProgrammableFilter filter) {
    _filter = filter;
    notifyListeners();
  }

  Future<ProgrammableTask> add({
    required String title,
    required String description,
    required DateTime due,
    required TaskPriority priority,
    required TaskCategory category,
    required int reminderMinutes,
  }) async {
    final task = await _storage.insertProgrammableTask((nid) => ProgrammableTask(
          id: generateId(),
          nid: nid,
          title: title.trim(),
          description: description.trim(),
          dueDateTime: due,
          createdAt: DateTime.now(),
          priority: priority,
          category: category,
          reminderMinutes: reminderMinutes,
        ));
    await _notifications.scheduleTask(task);
    _tasks.insert(0, task);
    notifyListeners();
    // A task created already due rings right away (web behaviour).
    unawaited(_alarms.check());
    return task;
  }

  Future<ProgrammableTask?> toggle(String id) async {
    final updated = await _mutate(id, (t) => t.copyWith(completed: !t.completed));
    if (updated != null && updated.completed) await _storage.removeMissedAlarms(id);
    await _reloadMissed();
    return updated;
  }

  Future<void> editTitle(String id, String title) => _mutate(id, (t) => t.copyWith(title: title.trim()));

  Future<void> delete(String id) async {
    final task = _find(id);
    if (task == null) return;
    await _notifications.cancelTask(task);
    await _images.delete(task.imagePath);
    await _storage.deleteProgrammableTask(id);
    _tasks.removeWhere((t) => t.id == id);
    await _reloadMissed();
  }

  // ---- Missed alarms ----

  Future<void> completeMissed(String id) async {
    await _mutate(id, (t) => t.copyWith(completed: true));
    await _storage.removeMissedAlarms(id);
    await _reloadMissed();
  }

  Future<void> rescheduleMissed(String id, DateTime when) async {
    await _mutate(id, (t) => AlarmRules.reschedule(t, when));
    await _storage.removeMissedAlarms(id);
    await _reloadMissed();
  }

  Future<void> dismissMissed(String id) async {
    await _storage.removeMissedAlarms(id);
    await _reloadMissed();
  }

  // ---- Images ----

  Future<bool> attachImage(String id, {required bool fromCamera}) async {
    final task = _find(id);
    if (task == null) return false;
    _uploadingTaskId = id;
    notifyListeners();
    try {
      final path = await _images.pickAndSave(id, fromCamera: fromCamera);
      if (path == null) return false;
      await _images.delete(task.imagePath);
      await _mutate(id, (t) => t.copyWith(imagePath: path));
      return true;
    } finally {
      _uploadingTaskId = null;
      notifyListeners();
    }
  }

  Future<void> removeImage(String id) async {
    final task = _find(id);
    if (task?.imagePath == null) return;
    await _images.delete(task!.imagePath);
    await _mutate(id, (t) => t.copyWith(clearImage: true));
  }

  // ---- Internals ----

  ProgrammableTask? _find(String id) {
    for (final t in _tasks) {
      if (t.id == id) return t;
    }
    return null;
  }

  /// Atomic update in SQLite (never overwrites a change made by a notification
  /// action), then re-schedules the task's alarms.
  Future<ProgrammableTask?> _mutate(String id, ProgrammableTask Function(ProgrammableTask) change) async {
    final updated = await _storage.updateProgrammableTask(id, change);
    final index = _tasks.indexWhere((t) => t.id == id);
    if (updated != null) {
      await _notifications.scheduleTask(updated);
      if (index != -1) _tasks[index] = updated;
    } else if (index != -1) {
      _tasks.removeAt(index);
    }
    notifyListeners();
    return updated;
  }

  Future<void> _reloadMissed() async {
    _missed = await _storage.getMissedAlarms();
    notifyListeners();
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }
}
