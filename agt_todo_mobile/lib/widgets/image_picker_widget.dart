import 'dart:io';

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:photo_view/photo_view.dart';

import '../config/theme.dart';

/// Asks camera or gallery. Resolves to true = camera, false = gallery, null = cancelled.
Future<bool?> showImageSourceSheet(BuildContext context) {
  return showModalBottomSheet<bool>(
    context: context,
    showDragHandle: true,
    builder: (context) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(Icons.photo_camera_outlined),
            title: Text('common.camera'.tr()),
            onTap: () => Navigator.pop(context, true),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: Text('common.gallery'.tr()),
            onTap: () => Navigator.pop(context, false),
          ),
        ],
      ),
    ),
  );
}

/// Full-screen, pinch-to-zoom image viewer (web .image-modal). Tap ✕ or back to close.
void showImageViewer(BuildContext context, String path) {
  Navigator.of(context).push(MaterialPageRoute<void>(
    fullscreenDialog: true,
    builder: (context) => Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        shape: const Border(),
        leading: IconButton(
          icon: const Icon(Icons.close),
          tooltip: 'common.close'.tr(),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: PhotoView(
        imageProvider: FileImage(File(path)),
        minScale: PhotoViewComputedScale.contained,
        maxScale: PhotoViewComputedScale.covered * 4,
      ),
    ),
  ));
}

/// Square thumbnail; tap opens the viewer. [onRemove] adds the web's ✕ badge.
class ImageThumbnail extends StatelessWidget {
  const ImageThumbnail({super.key, required this.path, this.onRemove, this.size = 80});

  final String path;
  final VoidCallback? onRemove;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        GestureDetector(
          onTap: () => showImageViewer(context, path),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.sm),
            child: Image.file(
              File(path),
              width: size,
              height: size,
              fit: BoxFit.cover,
              cacheWidth: (size * 3).round(),
              errorBuilder: (context, error, stack) => SizedBox(
                width: size,
                height: size,
                child: const Center(child: Text('🖼️')),
              ),
            ),
          ),
        ),
        if (onRemove != null)
          Positioned(
            top: -8,
            right: -8,
            child: Material(
              color: AppPalette.danger,
              shape: const CircleBorder(),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: onRemove,
                child: const Padding(
                  padding: EdgeInsets.all(4),
                  child: Icon(Icons.close, size: 14, color: Colors.white),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
