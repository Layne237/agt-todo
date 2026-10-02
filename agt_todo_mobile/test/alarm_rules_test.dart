import 'package:agt_todo_mobile/config/constants.dart';
import 'package:agt_todo_mobile/models/programmable_task.dart';
import 'package:agt_todo_mobile/utils/alarm_rules.dart';
import 'package:agt_todo_mobile/utils/date_formatter.dart';
import 'package:agt_todo_mobile/utils/validators.dart';
import 'package:flutter_test/flutter_test.dart';

/// Same scenarios as the web app's tests/alarm-store.test.js.
void main() {
  final now = DateTime(2026, 10, 2, 12);

  ProgrammableTask task({
    Duration dueIn = const Duration(minutes: 30),
    int reminderMinutes = 0,
    bool completed = false,
    bool reminderFired = false,
  }) =>
      ProgrammableTask(
        id: 't1',
        nid: 7,
        title: 'Task',
        dueDateTime: now.add(dueIn),
        createdAt: now,
        reminderMinutes: reminderMinutes,
        completed: completed,
        reminderFired: reminderFired,
      );

  group('fireDue', () {
    test('fires a due alarm exactly once', () {
      final first = AlarmRules.fireDue(task(dueIn: const Duration(seconds: -1)), now);
      expect(first.fired.single.kind, AlarmKind.due);
      expect(first.updated!.dueFired, isTrue);

      final second = AlarmRules.fireDue(first.updated!, now);
      expect(second.fired, isEmpty);
      expect(second.updated, isNull);
    });

    test('reminder fires before due', () {
      final result = AlarmRules.fireDue(task(dueIn: const Duration(minutes: 5), reminderMinutes: 10), now);
      expect(result.fired.single.kind, AlarmKind.reminder);
      expect(result.updated!.reminderFired, isTrue);
      expect(result.updated!.dueFired, isFalse);
    });

    test('a reminder only noticed after the due time is suppressed; the due alarm fires', () {
      final result = AlarmRules.fireDue(task(dueIn: const Duration(minutes: -1), reminderMinutes: 10), now);
      expect(result.fired.map((a) => a.kind), [AlarmKind.due]);
      expect(result.updated!.reminderFired, isTrue);
    });

    test('completed tasks never fire', () {
      expect(AlarmRules.fireDue(task(dueIn: const Duration(minutes: -5), completed: true), now).fired, isEmpty);
    });

    test('nothing fires before its time', () {
      final result = AlarmRules.fireDue(task(dueIn: const Duration(minutes: 30), reminderMinutes: 15), now);
      expect(result.fired, isEmpty);
      expect(result.updated, isNull);
    });
  });

  group('snooze', () {
    test('a snoozed due alarm re-fires 5 minutes later', () {
      final fired = AlarmRules.fireDue(task(dueIn: const Duration(seconds: -1)), now).updated!;
      final snoozed = AlarmRules.snooze(fired, AlarmKind.due, now);
      expect(snoozed.snoozedUntil, now.add(const Duration(minutes: 5)));
      expect(AlarmRules.fireDue(snoozed, now.add(const Duration(minutes: 4))).fired, isEmpty);
      expect(AlarmRules.fireDue(snoozed, now.add(const Duration(minutes: 5, seconds: 1))).fired.single.kind, AlarmKind.due);
    });

    test('snoozing a reminder keeps the due time', () {
      final t = task(dueIn: const Duration(minutes: 30), reminderMinutes: 30, reminderFired: true);
      final snoozed = AlarmRules.snooze(t, AlarmKind.reminder, now);
      expect(snoozed.dueDateTime, t.dueDateTime);
      expect(snoozed.snoozedUntil, isNull);
      final fired = AlarmRules.fireDue(snoozed, now.add(const Duration(minutes: 5, seconds: 1))).fired;
      expect(fired.map((a) => a.kind), [AlarmKind.reminder]);
    });

    test('snoozing a reminder past the due time leaves it to the due alarm', () {
      final t = task(dueIn: const Duration(minutes: 2), reminderMinutes: 10, reminderFired: true);
      expect(AlarmRules.snooze(t, AlarmKind.reminder, now).remindAgainAt, isNull);
    });
  });

  group('pendingAlarms', () {
    test('lists reminder and due with their times', () {
      final alarms = AlarmRules.pendingAlarms(task(dueIn: const Duration(minutes: 30), reminderMinutes: 10));
      expect(alarms.map((a) => (a.kind, a.at)), [
        (AlarmKind.reminder, now.add(const Duration(minutes: 20))),
        (AlarmKind.due, now.add(const Duration(minutes: 30))),
      ]);
    });

    test('reschedule resets all alarm state', () {
      final fired = AlarmRules.fireDue(task(dueIn: const Duration(minutes: -60), reminderMinutes: 5), now).updated!;
      final when = now.add(const Duration(hours: 1));
      final rescheduled = AlarmRules.reschedule(fired, when);
      expect(rescheduled.dueDateTime, when);
      expect(AlarmRules.pendingAlarms(rescheduled).length, 2);
    });
  });

  test('alarms more than 15 minutes late are missed', () {
    expect(AlarmRules.isMissed(now.subtract(const Duration(minutes: 14)), now), isFalse);
    expect(AlarmRules.isMissed(now.subtract(const Duration(minutes: 16)), now), isTrue);
  });

  test('notification ids are unique per task and alarm kind', () {
    final t = task();
    expect(t.notificationId(AlarmKind.reminder), 14);
    expect(t.notificationId(AlarmKind.due), 15);
  });

  test('model survives a database round trip', () {
    final t = AlarmRules.snooze(task(reminderMinutes: 15), AlarmKind.due, now);
    final back = ProgrammableTask.fromMap(t.toMap());
    expect(back.toMap(), t.toMap());
  });

  test('countdown format matches the web app', () {
    expect(DateFormatter.countdown(const Duration(minutes: 4, seconds: 32)), '4:32');
    expect(DateFormatter.countdown(const Duration(hours: 1, minutes: 5)), '1h 05m');
    expect(DateFormatter.countdown(const Duration(seconds: -65)), '1:05');
    expect(DateFormatter.created(DateTime(2026, 3, 7, 9, 5)), '07/03/2026 09:05');
  });

  test('validators', () {
    expect(Validators.classicTask('   '), 'classic.errorEmpty');
    expect(Validators.classicTask('Buy milk'), isNull);
    expect(Validators.taskTitle(''), 'prog.errorTitle');
    expect(Validators.futureDate(now.subtract(const Duration(minutes: 1)), now: now), 'missed.pickFuture');
    expect(Validators.futureDate(now.add(const Duration(minutes: 1)), now: now), isNull);
  });
}
