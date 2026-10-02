import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:vibration/vibration.dart';

import '../config/constants.dart';
import '../models/programmable_task.dart';
import '../utils/alarm_rules.dart';
import 'notification_service.dart';
import 'storage_service.dart';

/// The alarm currently ringing on screen.
class ActiveAlarm {
  const ActiveAlarm({required this.task, required this.kind, required this.at, required this.firedAt, this.isTest = false});

  final ProgrammableTask task;
  final AlarmKind kind;
  final DateTime at;
  final DateTime firedAt;
  final bool isTest;
}

/// The in-app side of the alarm system (the OS covers the time the app is closed):
///  - checks every 5 s and on resume for alarms that are due (same rules as the web app),
///  - rings a full-screen alarm with escalating volume and repeating vibration,
///  - sends alarms found more than 15 min late to "Missed Alarms",
///  - handles notification taps and action buttons while the app is running.
class AlarmService extends ChangeNotifier with WidgetsBindingObserver {
  AlarmService._();
  static final AlarmService instance = AlarmService._();

  final _storage = StorageService.instance;
  final _notifications = NotificationService.instance;

  final _tasksChanged = StreamController<void>.broadcast();
  final _missedAnnouncements = StreamController<int>.broadcast();

  /// Fires whenever task data changed outside the providers (alarm fired, notification action...).
  Stream<void> get tasksChanged => _tasksChanged.stream;

  /// Number of missed alarms to announce ("N tasks were missed while you were away").
  Stream<int> get missedAnnouncements => _missedAnnouncements.stream;

  /// Set by the app: opens the alarm screen.
  VoidCallback? showAlarmScreen;

  ActiveAlarm? _active;
  ActiveAlarm? get active => _active;
  final List<ActiveAlarm> _queue = [];

  Timer? _checkTimer;
  bool _checking = false;
  bool _started = false;

  AudioPlayer? _player;
  Timer? _rampTimer;

  // ========================================
  // LIFECYCLE
  // ========================================

  Future<void> start() async {
    if (_started) return;
    _started = true;
    WidgetsBinding.instance.addObserver(this);
    await check(announceMissed: true);
    _checkTimer = Timer.periodic(AppConstants.alarmCheckInterval, (_) => check());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // Notification actions may have changed tasks while we were in the background.
      _tasksChanged.add(null);
      check(announceMissed: true);
    }
  }

  // ========================================
  // CHECKING
  // ========================================

  /// Marks due alarms as fired and either rings them or lists them as missed.
  Future<void> check({bool announceMissed = false}) async {
    if (_checking) return;
    _checking = true;
    try {
      final now = DateTime.now();
      final fired = await _storage.fireDueAlarms(now);
      if (fired.isNotEmpty) {
        _tasksChanged.add(null);
        final missed = <MissedAlarm>[];
        for (final alarm in fired) {
          if (AlarmRules.isMissed(alarm.at, now)) {
            missed.add(MissedAlarm(taskId: alarm.task.id, kind: alarm.kind, at: alarm.at, firedAt: now));
            // Stop the OS notification if it's still ringing; the alarm now lives in Missed Alarms.
            await _notifications.cancelShown(alarm.task, alarm.kind);
          } else {
            _enqueue(ActiveAlarm(task: alarm.task, kind: alarm.kind, at: alarm.at, firedAt: now));
          }
        }
        if (missed.isNotEmpty) {
          await _storage.addMissedAlarms(missed);
          await _storage.log('App', '${missed.length} alarm(s) missed');
        }
      }
      if (announceMissed) {
        await _storage.pruneMissedAlarms();
        final count = (await _storage.getMissedAlarms()).length;
        if (count > 0) _missedAnnouncements.add(count);
      }
    } catch (e) {
      await _storage.log('App', 'alarm check failed: $e');
    } finally {
      _checking = false;
    }
  }

  // ========================================
  // QUEUE
  // ========================================

  void _enqueue(ActiveAlarm alarm) {
    final duplicate = _queue.any((a) => a.task.id == alarm.task.id) || _active?.task.id == alarm.task.id;
    if (!duplicate) _queue.add(alarm);
    _next();
  }

  Future<void> _next() async {
    if (_active != null || _queue.isEmpty) return;
    final next = _queue.removeAt(0);

    var task = next.task;
    if (!next.isTest) {
      // The task may have been completed or deleted since it was queued.
      final fresh = await _storage.getProgrammableTask(task.id);
      if (fresh == null || fresh.completed) return _next();
      task = fresh;
      // The in-app alarm takes over from the OS notification's looping sound.
      await _notifications.cancelShown(task, next.kind);
    }

    _active = ActiveAlarm(task: task, kind: next.kind, at: next.at, firedAt: next.firedAt, isTest: next.isTest);
    await _storage.log('App', 'ringing ${next.kind.name} for "${task.title}"');
    notifyListeners();
    showAlarmScreen?.call();
    await _startRinging();
  }

  /// Closes the current alarm and moves on to the next one in the queue.
  ActiveAlarm? _take() {
    final alarm = _active;
    _active = null;
    _stopRinging();
    notifyListeners();
    // Small delay so the next queued alarm doesn't appear instantly.
    Future.delayed(const Duration(milliseconds: 300), _next);
    return alarm;
  }

  // ========================================
  // USER CHOICES ON THE ALARM SCREEN
  // ========================================

  Future<ActiveAlarm?> complete() async {
    final alarm = _take();
    if (alarm == null || alarm.isTest) return alarm;
    final updated = await _storage.updateProgrammableTask(alarm.task.id, (t) => t.copyWith(completed: true));
    if (updated != null) await _notifications.cancelTask(updated);
    await _storage.removeMissedAlarms(alarm.task.id);
    await _storage.log('App', 'alarm completed: ${alarm.task.id}');
    _tasksChanged.add(null);
    return alarm;
  }

  Future<ActiveAlarm?> snooze() async {
    final alarm = _take();
    if (alarm == null || alarm.isTest) return alarm;
    final updated = await _storage.updateProgrammableTask(
      alarm.task.id,
      (t) => AlarmRules.snooze(t, alarm.kind, DateTime.now()),
    );
    if (updated != null) await _notifications.scheduleTask(updated);
    await _storage.removeMissedAlarms(alarm.task.id);
    await _storage.log('App', 'alarm snoozed: ${alarm.task.id}');
    _tasksChanged.add(null);
    return alarm;
  }

  /// Silences the alarm; the task stays active (and shows as overdue).
  Future<ActiveAlarm?> dismiss() async {
    final alarm = _take();
    if (alarm == null || alarm.isTest) return alarm;
    await _storage.removeMissedAlarms(alarm.task.id);
    await _storage.log('App', 'alarm dismissed: ${alarm.task.id}');
    _tasksChanged.add(null);
    return alarm;
  }

  // ========================================
  // NOTIFICATIONS (while the app runs)
  // ========================================

  /// Taps and action buttons on notifications while the app is running,
  /// and the notification that launched the app.
  Future<void> handleNotificationResponse(NotificationResponse response) async {
    final payload = AlarmPayload.decode(response.payload);
    if (payload == null) return;
    final actionId = response.actionId;

    if (actionId != null && actionId.isNotEmpty) {
      final changed = await applyNotificationAction(actionId, payload, source: 'App');
      if (_active?.task.id == payload.taskId) _take();
      if (changed) _tasksChanged.add(null);
      return;
    }
    await showFromNotification(payload);
  }

  /// Tapped notification / full-screen alarm: open the ringing alarm screen.
  Future<void> showFromNotification(AlarmPayload payload) async {
    if (payload.kind == AlarmKind.test) {
      ringTest();
      return;
    }
    // Mark it fired so the periodic check doesn't queue it a second time.
    final task = await _storage.updateProgrammableTask(
      payload.taskId,
      (t) => payload.kind == AlarmKind.reminder ? t.copyWith(reminderFired: true, clearRemindAgain: true) : t.copyWith(dueFired: true),
    );
    if (task == null || task.completed) return;
    await _storage.removeMissedAlarms(task.id);
    _tasksChanged.add(null);
    _enqueue(ActiveAlarm(task: task, kind: payload.kind, at: payload.at, firedAt: DateTime.now()));
  }

  /// Rings the in-app alarm with a fake task (dev menu / "Test").
  void ringTest({String title = 'Test Alarm Task', String description = ''}) {
    final now = DateTime.now();
    _enqueue(ActiveAlarm(
      task: ProgrammableTask(
        id: '__test__',
        nid: 0,
        title: title,
        description: description,
        dueDateTime: now,
        createdAt: now,
        priority: TaskPriority.high,
        category: TaskCategory.other,
      ),
      kind: AlarmKind.due,
      at: now,
      firedAt: now,
      isTest: true,
    ));
  }

  // ========================================
  // SOUND + VIBRATION
  // ========================================

  Future<void> _startRinging() async {
    _stopRinging();
    try {
      final player = AudioPlayer();
      _player = player;
      await player.setAudioContext(AudioContext(
        android: const AudioContextAndroid(
          usageType: AndroidUsageType.alarm, // plays at alarm volume, even in silent mode
          contentType: AndroidContentType.sonification,
          audioFocus: AndroidAudioFocus.gainTransient,
          stayAwake: true,
        ),
        iOS: AudioContextIOS(category: AVAudioSessionCategory.playback),
      ));
      await player.setReleaseMode(ReleaseMode.loop);
      await player.play(AssetSource('sounds/alarm.wav'), volume: AppConstants.ringStartVolume);

      // Escalate from 15% to 100% over 10 s, like the web alarm.
      final started = DateTime.now();
      _rampTimer = Timer.periodic(const Duration(milliseconds: 250), (timer) {
        final progress = DateTime.now().difference(started).inMilliseconds / AppConstants.ringEscalation.inMilliseconds;
        final volume = AppConstants.ringStartVolume + (1 - AppConstants.ringStartVolume) * progress.clamp(0.0, 1.0);
        player.setVolume(volume);
        if (progress >= 1) timer.cancel();
      });
    } catch (e) {
      await _storage.log('App', 'alarm sound failed: $e');
    }

    if (await Vibration.hasVibrator()) {
      // repeat: 0 loops the whole pattern until cancelled.
      Vibration.vibrate(pattern: AppConstants.vibrationPattern, repeat: 0);
    }
  }

  void _stopRinging() {
    _rampTimer?.cancel();
    _rampTimer = null;
    final player = _player;
    _player = null;
    if (player != null) {
      player.stop().whenComplete(player.dispose);
    }
    Vibration.cancel();
  }

  @override
  void dispose() {
    _checkTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    _stopRinging();
    super.dispose();
  }
}
