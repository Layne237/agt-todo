import 'dart:convert';

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../config/theme.dart';
import '../services/alarm_service.dart';
import '../services/notification_service.dart';
import '../services/storage_service.dart';

/// Hidden developer menu (tap the "Programmable Todo" title 5 times), mobile
/// version of the web dev menu.
void showDevMenu(BuildContext context) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (context) => const _DevMenu(),
  );
}

class _DevMenu extends StatefulWidget {
  const _DevMenu();

  @override
  State<_DevMenu> createState() => _DevMenuState();
}

class _DevMenuState extends State<_DevMenu> {
  final _notifications = NotificationService.instance;
  String _output = '';

  Future<void> _run(Future<String> Function() action) async {
    setState(() => _output = '…');
    try {
      final result = await action();
      if (mounted) setState(() => _output = result.isEmpty ? 'dev.none'.tr() : result);
    } catch (e) {
      if (mounted) setState(() => _output = '❌ $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = AppPalette.of(context);
    final buttons = <(String, Future<String> Function())>[
      ('dev.testNotification'.tr(), () async {
        await _notifications.showTest();
        return '✅';
      }),
      ('dev.alarm10s'.tr(), () async {
        await _notifications.scheduleTestAlarm(const Duration(seconds: 10));
        return 'dev.alarm10sDone'.tr();
      }),
      ('dev.ringNow'.tr(), () async {
        Navigator.pop(context);
        AlarmService.instance.ringTest(title: 'alarm.testTitle'.tr(), description: 'alarm.testDescription'.tr());
        return '';
      }),
      ('dev.permissions'.tr(), () async => const JsonEncoder.withIndent('  ').convert((await _notifications.permissions()).toJson())),
      ('dev.pending'.tr(), () async {
        final pending = await _notifications.pending();
        return pending.map((n) => '#${n.id}  ${n.title}\n    ${n.payload}').join('\n');
      }),
      ('dev.forceCheck'.tr(), () async {
        await AlarmService.instance.check(announceMissed: true);
        return '✅';
      }),
      ('dev.eventLog'.tr(), () async => (await StorageService.instance.getLog()).join('\n')),
    ];

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(AppSpacing.md, 0, AppSpacing.md, AppSpacing.md),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('dev.title'.tr(), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: AppSpacing.sm),
            for (final (label, action) in buttons)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(alignment: Alignment.centerLeft, padding: const EdgeInsets.all(12)),
                  onPressed: () => _run(action),
                  child: Text(label),
                ),
              ),
            const SizedBox(height: AppSpacing.sm),
            Container(
              constraints: BoxConstraints(minHeight: 80, maxHeight: MediaQuery.sizeOf(context).height * 0.3),
              padding: const EdgeInsets.all(AppSpacing.sm),
              decoration: BoxDecoration(
                color: p.bgPrimary,
                borderRadius: BorderRadius.circular(AppRadius.sm),
                border: Border.all(color: p.border),
              ),
              child: SingleChildScrollView(
                child: SelectableText(_output, style: const TextStyle(fontFamily: 'monospace', fontSize: 11)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
