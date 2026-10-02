import '../config/constants.dart';
import '../models/programmable_task.dart';

/// Alarm rules, ported 1:1 from the web app (shared/js/alarm-store.js).
/// Pure functions: no I/O, so they are easy to unit test.
class AlarmRules {
  AlarmRules._();

  /// Alarms of [task] that have not fired yet.
  static List<PendingAlarm> pendingAlarms(ProgrammableTask task) {
    if (task.completed) return const [];
    final due = task.effectiveDue;
    final pending = <PendingAlarm>[];
    final reminderAt = task.reminderTime;
    // A reminder only exists if it comes before the due time.
    if (reminderAt != null && !task.reminderFired && reminderAt.isBefore(due)) {
      pending.add(PendingAlarm(task, AlarmKind.reminder, reminderAt));
    }
    if (!task.dueFired) pending.add(PendingAlarm(task, AlarmKind.due, due));
    return pending;
  }

  /// Marks every alarm of [task] whose time has come as fired.
  /// Returns the updated task (or null if nothing changed) and the alarms that fired.
  ///
  /// A reminder that is only noticed after the due time is marked fired but not
  /// returned: the due alarm supersedes it.
  static ({ProgrammableTask? updated, List<PendingAlarm> fired}) fireDue(ProgrammableTask task, DateTime now) {
    var updated = task;
    var changed = false;
    final fired = <PendingAlarm>[];
    final due = task.effectiveDue;

    for (final alarm in pendingAlarms(task)) {
      if (now.isBefore(alarm.at)) continue;
      changed = true;
      if (alarm.kind == AlarmKind.reminder) {
        updated = updated.copyWith(reminderFired: true, clearRemindAgain: true);
        if (!now.isBefore(due)) continue;
      } else {
        updated = updated.copyWith(dueFired: true);
      }
      fired.add(PendingAlarm(updated, alarm.kind, alarm.at));
    }
    return (updated: changed ? updated : null, fired: fired);
  }

  /// Snooze: a reminder re-rings in 5 min (if that is still before the due
  /// time); a due alarm moves to 5 min from now.
  static ProgrammableTask snooze(ProgrammableTask task, AlarmKind kind, DateTime now) {
    final until = now.add(const Duration(minutes: AppConstants.snoozeMinutes));
    if (kind == AlarmKind.reminder) {
      if (until.isBefore(task.effectiveDue)) {
        return task.copyWith(remindAgainAt: until, reminderFired: false);
      }
      // The due alarm comes first anyway.
      return task;
    }
    return task.copyWith(snoozedUntil: until, dueFired: false, reminderFired: true);
  }

  /// Reschedule (from Missed Alarms): new due time, all alarm state reset.
  static ProgrammableTask reschedule(ProgrammableTask task, DateTime when) => task.copyWith(
        dueDateTime: when,
        clearSnooze: true,
        clearRemindAgain: true,
        dueFired: false,
        reminderFired: false,
      );

  /// True if an alarm discovered at [now] is too late to ring and should be listed as missed.
  static bool isMissed(DateTime at, DateTime now) => now.difference(at) > AppConstants.missedAfter;
}
