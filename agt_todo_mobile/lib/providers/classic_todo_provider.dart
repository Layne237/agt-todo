import 'package:flutter/foundation.dart';

import '../models/classic_task.dart';
import '../services/image_service.dart';
import '../services/storage_service.dart';
import '../utils/helpers.dart';

enum ClassicFilter { all, active, completed }

/// Classic Todo state: same behaviour as the web app's classic/js/app.js.
class ClassicTodoProvider extends ChangeNotifier {
  ClassicTodoProvider({StorageService? storage, ImageService? images})
      : _storage = storage ?? StorageService.instance,
        _images = images ?? ImageService.instance;

  final StorageService _storage;
  final ImageService _images;

  List<ClassicTask> _tasks = [];
  ClassicFilter _filter = ClassicFilter.all;
  bool _loaded = false;
  String? _uploadingTaskId;

  bool get loaded => _loaded;
  ClassicFilter get filter => _filter;
  String? get uploadingTaskId => _uploadingTaskId;
  List<ClassicTask> get allTasks => List.unmodifiable(_tasks);

  List<ClassicTask> get tasks => switch (_filter) {
        ClassicFilter.active => _tasks.where((t) => !t.completed).toList(),
        ClassicFilter.completed => _tasks.where((t) => t.completed).toList(),
        ClassicFilter.all => List.unmodifiable(_tasks),
      };

  int get remainingCount => _tasks.where((t) => !t.completed).length;
  int get completedCount => _tasks.where((t) => t.completed).length;

  Future<void> load() async {
    _tasks = await _storage.getClassicTasks();
    _loaded = true;
    notifyListeners();
  }

  void setFilter(ClassicFilter filter) {
    _filter = filter;
    notifyListeners();
  }

  /// Returns false if [text] is empty (the screen shows the error).
  Future<bool> add(String text) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return false;
    final task = ClassicTask(id: generateId(), text: trimmed, createdAt: DateTime.now());
    await _storage.saveClassicTask(task);
    _tasks.insert(0, task);
    notifyListeners();
    return true;
  }

  Future<void> toggle(String id) => _update(id, (t) => t.copyWith(completed: !t.completed));

  /// Returns false if [text] is empty.
  Future<bool> edit(String id, String text) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return false;
    await _update(id, (t) => t.copyWith(text: trimmed));
    return true;
  }

  Future<void> delete(String id) async {
    final task = _find(id);
    if (task == null) return;
    await _images.delete(task.imagePath);
    await _storage.deleteClassicTask(id);
    _tasks.removeWhere((t) => t.id == id);
    notifyListeners();
  }

  /// Deletes completed tasks (and their images). Returns how many were removed.
  Future<int> clearCompleted() async {
    final completed = _tasks.where((t) => t.completed).toList();
    for (final task in completed) {
      await _images.delete(task.imagePath);
    }
    await _storage.deleteCompletedClassicTasks();
    _tasks.removeWhere((t) => t.completed);
    notifyListeners();
    return completed.length;
  }

  /// Returns true if an image was attached (false if cancelled).
  /// Throws ImageTooLargeException like the web's 2 MB check.
  Future<bool> attachImage(String id, {required bool fromCamera}) async {
    final task = _find(id);
    if (task == null) return false;
    _uploadingTaskId = id;
    notifyListeners();
    try {
      final path = await _images.pickAndSave(id, fromCamera: fromCamera);
      if (path == null) return false;
      await _images.delete(task.imagePath);
      await _update(id, (t) => t.copyWith(imagePath: path));
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
    await _update(id, (t) => t.copyWith(clearImage: true));
  }

  ClassicTask? _find(String id) {
    for (final t in _tasks) {
      if (t.id == id) return t;
    }
    return null;
  }

  Future<void> _update(String id, ClassicTask Function(ClassicTask) change) async {
    final index = _tasks.indexWhere((t) => t.id == id);
    if (index == -1) return;
    final updated = change(_tasks[index]);
    await _storage.saveClassicTask(updated);
    _tasks[index] = updated;
    notifyListeners();
  }
}
