import 'dart:math';

final _random = Random();

/// Same id format as the web app: `<timestamp>-<8 random base36 chars>`.
String generateId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  final suffix = List.generate(8, (_) => chars[_random.nextInt(chars.length)]).join();
  return '${DateTime.now().millisecondsSinceEpoch}-$suffix';
}
