import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

import '../models/classic_task.dart';
import '../models/programmable_task.dart';
import '../utils/alarm_rules.dart';

/// SQLite storage for tasks, missed alarms and the alarm event log.
///
/// Also opened from the background isolate that handles notification actions
/// (Snooze / Complete while the app is closed), so every alarm-state change is
/// a single transaction: the app and the background handler can never
/// overwrite each other's changes.
class StorageService {
  StorageService._();
  static final StorageService instance = StorageService._();

  static const _dbName = 'agt_todo.db';
  static const _dbVersion = 1;
  static const _maxLogEntries = 100;

  Database? _db;

  Future<Database> get db async => _db ??= await _open();

  Future<Database> _open() async {
    final path = p.join(await getDatabasesPath(), _dbName);
    return openDatabase(
      path,
      version: _dbVersion,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE classic_tasks (
            id TEXT PRIMARY KEY,
            text TEXT NOT NULL,
            completed INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            image_path TEXT
          )''');
        await db.execute('''
          CREATE TABLE programmable_tasks (
            id TEXT PRIMARY KEY,
            nid INTEGER NOT NULL UNIQUE,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            due_date_time TEXT NOT NULL,
            completed INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            priority TEXT NOT NULL,
            category TEXT NOT NULL,
            reminder_minutes INTEGER NOT NULL DEFAULT 0,
            reminder_fired INTEGER NOT NULL DEFAULT 0,
            due_fired INTEGER NOT NULL DEFAULT 0,
            snoozed_until TEXT,
            remind_again_at TEXT,
            image_path TEXT
          )''');
        await db.execute('''
          CREATE TABLE missed_alarms (
            task_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            at TEXT NOT NULL,
            fired_at TEXT NOT NULL,
            PRIMARY KEY (task_id, kind)
          )''');
        await db.execute('''
          CREATE TABLE event_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            t TEXT NOT NULL,
            source TEXT NOT NULL,
            message TEXT NOT NULL
          )''');
      },
    );
  }

  // ========================================
  // CLASSIC TODO
  // ========================================

  Future<List<ClassicTask>> getClassicTasks() async {
    final rows = await (await db).query('classic_tasks', orderBy: 'created_at DESC');
    return rows.map(ClassicTask.fromMap).toList();
  }

  Future<void> saveClassicTask(ClassicTask task) async {
    await (await db).insert('classic_tasks', task.toMap(), conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<void> deleteClassicTask(String id) async {
    await (await db).delete('classic_tasks', where: 'id = ?', whereArgs: [id]);
  }

  Future<void> deleteCompletedClassicTasks() async {
    await (await db).delete('classic_tasks', where: 'completed = 1');
  }

  // ========================================
  // PROGRAMMABLE TODO
  // ========================================

  Future<List<ProgrammableTask>> getProgrammableTasks() async {
    final rows = await (await db).query('programmable_tasks', orderBy: 'created_at DESC');
    return rows.map(ProgrammableTask.fromMap).toList();
  }

  Future<ProgrammableTask?> getProgrammableTask(String id) async {
    final rows = await (await db).query('programmable_tasks', where: 'id = ?', whereArgs: [id], limit: 1);
    return rows.isEmpty ? null : ProgrammableTask.fromMap(rows.first);
  }

  /// Inserts a new task, allocating its notification-id base ([ProgrammableTask.nid]).
  Future<ProgrammableTask> insertProgrammableTask(ProgrammableTask Function(int nid) build) async {
    return (await db).transaction((txn) async {
      final result = await txn.rawQuery('SELECT COALESCE(MAX(nid), 0) + 1 AS next FROM programmable_tasks');
      final task = build(result.first['next'] as int);
      await txn.insert('programmable_tasks', task.toMap());
      return task;
    });
  }

  /// Atomically applies [mutate] to one task. Returns the updated task, or null if it doesn't exist.
  Future<ProgrammableTask?> updateProgrammableTask(String id, ProgrammableTask Function(ProgrammableTask) mutate) async {
    return (await db).transaction((txn) async {
      final rows = await txn.query('programmable_tasks', where: 'id = ?', whereArgs: [id], limit: 1);
      if (rows.isEmpty) return null;
      final updated = mutate(ProgrammableTask.fromMap(rows.first));
      await txn.update('programmable_tasks', updated.toMap(), where: 'id = ?', whereArgs: [id]);
      return updated;
    });
  }

  Future<void> deleteProgrammableTask(String id) async {
    final database = await db;
    await database.transaction((txn) async {
      await txn.delete('programmable_tasks', where: 'id = ?', whereArgs: [id]);
      await txn.delete('missed_alarms', where: 'task_id = ?', whereArgs: [id]);
    });
  }

  /// Marks every alarm whose time has come as fired, in ONE transaction, and
  /// returns them. Each alarm is returned exactly once, whoever asks first.
  Future<List<PendingAlarm>> fireDueAlarms(DateTime now) async {
    return (await db).transaction((txn) async {
      final rows = await txn.query('programmable_tasks', where: 'completed = 0');
      final fired = <PendingAlarm>[];
      for (final row in rows) {
        final result = AlarmRules.fireDue(ProgrammableTask.fromMap(row), now);
        if (result.updated != null) {
          await txn.update('programmable_tasks', result.updated!.toMap(), where: 'id = ?', whereArgs: [result.updated!.id]);
        }
        fired.addAll(result.fired);
      }
      return fired;
    });
  }

  // ========================================
  // MISSED ALARMS
  // ========================================

  Future<List<MissedAlarm>> getMissedAlarms() async {
    final rows = await (await db).query('missed_alarms', orderBy: 'at ASC');
    return rows.map(MissedAlarm.fromMap).toList();
  }

  Future<void> addMissedAlarms(List<MissedAlarm> alarms) async {
    if (alarms.isEmpty) return;
    final batch = (await db).batch();
    for (final alarm in alarms) {
      batch.insert('missed_alarms', alarm.toMap(), conflictAlgorithm: ConflictAlgorithm.ignore);
    }
    await batch.commit(noResult: true);
  }

  Future<void> removeMissedAlarms(String taskId) async {
    await (await db).delete('missed_alarms', where: 'task_id = ?', whereArgs: [taskId]);
  }

  /// Drops missed entries whose task was completed or deleted.
  Future<void> pruneMissedAlarms() async {
    await (await db).rawDelete('''
      DELETE FROM missed_alarms WHERE task_id NOT IN (
        SELECT id FROM programmable_tasks WHERE completed = 0
      )''');
  }

  // ========================================
  // EVENT LOG (dev menu)
  // ========================================

  Future<void> log(String source, String message) async {
    // ignore: avoid_print
    print('[$source ${DateTime.now().toIso8601String()}] $message');
    try {
      final database = await db;
      await database.insert('event_log', {'t': DateTime.now().toIso8601String(), 'source': source, 'message': message});
      await database.rawDelete(
        'DELETE FROM event_log WHERE id NOT IN (SELECT id FROM event_log ORDER BY id DESC LIMIT ?)',
        [_maxLogEntries],
      );
    } catch (_) {
      // Logging must never break the app.
    }
  }

  Future<List<String>> getLog() async {
    final rows = await (await db).query('event_log', orderBy: 'id DESC', limit: 60);
    return rows.map((r) => '${r['t']}  [${r['source']}] ${r['message']}').toList();
  }
}
