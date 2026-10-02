/// A Classic Todo task. Same fields as the web app's `classic_todo_app` entries,
/// except images are files on disk (path) instead of base64 in IndexedDB.
class ClassicTask {
  ClassicTask({
    required this.id,
    required this.text,
    required this.createdAt,
    this.completed = false,
    this.imagePath,
  });

  final String id;
  final String text;
  final bool completed;
  final DateTime createdAt;
  final String? imagePath;

  ClassicTask copyWith({String? text, bool? completed, String? imagePath, bool clearImage = false}) => ClassicTask(
        id: id,
        text: text ?? this.text,
        completed: completed ?? this.completed,
        createdAt: createdAt,
        imagePath: clearImage ? null : (imagePath ?? this.imagePath),
      );

  Map<String, Object?> toMap() => {
        'id': id,
        'text': text,
        'completed': completed ? 1 : 0,
        'created_at': createdAt.toIso8601String(),
        'image_path': imagePath,
      };

  factory ClassicTask.fromMap(Map<String, Object?> map) => ClassicTask(
        id: map['id'] as String,
        text: map['text'] as String,
        completed: (map['completed'] as int? ?? 0) == 1,
        createdAt: DateTime.parse(map['created_at'] as String),
        imagePath: map['image_path'] as String?,
      );
}
