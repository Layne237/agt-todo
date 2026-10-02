import 'package:flutter/material.dart';

import '../config/theme.dart';

enum ToastType { info, success, error }

/// Web-style toast (coloured pill at the bottom), as a floating SnackBar.
void showToast(BuildContext context, String message, {ToastType type = ToastType.info}) {
  final messenger = ScaffoldMessenger.maybeOf(context);
  if (messenger == null) return;
  final color = switch (type) {
    ToastType.success => AppPalette.success,
    ToastType.error => AppPalette.danger,
    ToastType.info => AppPalette.accent,
  };
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message), backgroundColor: color, duration: const Duration(seconds: 3)));
}

/// Web confirm() equivalent. Resolves to true if the user confirmed.
Future<bool> confirmDialog(BuildContext context, String message, {required String confirmLabel, required String cancelLabel}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      content: Text(message),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: Text(cancelLabel)),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: AppPalette.danger),
          onPressed: () => Navigator.pop(context, true),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return result ?? false;
}

/// Web prompt() equivalent for editing a text. Resolves to the new text, or null if cancelled.
Future<String?> promptDialog(
  BuildContext context, {
  required String title,
  required String initialValue,
  required int maxLength,
  required String saveLabel,
  required String cancelLabel,
}) {
  final controller = TextEditingController(text: initialValue);
  return showDialog<String>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: TextField(
        controller: controller,
        autofocus: true,
        maxLength: maxLength,
        textInputAction: TextInputAction.done,
        onSubmitted: (value) => Navigator.pop(context, value),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(cancelLabel)),
        FilledButton(onPressed: () => Navigator.pop(context, controller.text), child: Text(saveLabel)),
      ],
    ),
  ).whenComplete(controller.dispose);
}
