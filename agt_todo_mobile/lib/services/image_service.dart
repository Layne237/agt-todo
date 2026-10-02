import 'dart:io';

import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../config/constants.dart';

class ImageTooLargeException implements Exception {}

/// Task images: picked from the camera or gallery, compressed, and copied into
/// the app's private folder (the web app keeps them as base64 in IndexedDB).
class ImageService {
  ImageService._();
  static final ImageService instance = ImageService._();

  final _picker = ImagePicker();

  Future<Directory> _imagesDir() async {
    final dir = Directory(p.join((await getApplicationDocumentsDirectory()).path, 'task_images'));
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  /// Returns the saved file path, or null if the user cancelled.
  /// Throws [ImageTooLargeException] if the image is still over 2 MB after compression.
  Future<String?> pickAndSave(String taskId, {required bool fromCamera}) async {
    final picked = await _picker.pickImage(
      source: fromCamera ? ImageSource.camera : ImageSource.gallery,
      // Phone photos are large; downscale so they fit the web app's 2 MB limit.
      maxWidth: 1920,
      maxHeight: 1920,
      imageQuality: 85,
    );
    if (picked == null) return null;
    if (await picked.length() > AppConstants.maxImageBytes) throw ImageTooLargeException();

    final ext = p.extension(picked.path).isEmpty ? '.jpg' : p.extension(picked.path);
    final target = p.join((await _imagesDir()).path, '${taskId}_${DateTime.now().millisecondsSinceEpoch}$ext');
    await picked.saveTo(target);
    return target;
  }

  Future<void> delete(String? path) async {
    if (path == null) return;
    try {
      final file = File(path);
      if (await file.exists()) await file.delete();
    } catch (_) {
      // A missing file is fine.
    }
  }
}
