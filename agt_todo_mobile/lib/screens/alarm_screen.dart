import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../services/alarm_service.dart';
import '../widgets/alarm_modal.dart';
import '../widgets/toast.dart';

/// Full-screen ringing alarm. Shown over the lock screen when a full-screen
/// alarm notification fires; can only be closed with its buttons (like the web modal).
class AlarmScreen extends StatelessWidget {
  const AlarmScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final service = context.watch<AlarmService>();
    final alarm = service.active;

    // The alarm was handled (e.g. from the notification): close this screen.
    if (alarm == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted && Navigator.of(context).canPop()) Navigator.of(context).pop();
      });
    }

    Future<void> finish(Future<ActiveAlarm?> Function() action, String Function(ActiveAlarm) message, ToastType type) async {
      final done = await action();
      if (done != null && context.mounted) showToast(context, message(done), type: type);
    }

    return PopScope(
      canPop: false, // back button can't silence the alarm
      child: Scaffold(
        backgroundColor: Colors.black.withValues(alpha: 0.88),
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: alarm == null
                  ? const SizedBox.shrink()
                  : AlarmModal(
                      key: ValueKey('${alarm.task.id}-${alarm.kind.name}-${alarm.firedAt.millisecondsSinceEpoch}'),
                      alarm: alarm,
                      onSnooze: () => finish(service.snooze, (a) => 'alarm.snoozed'.tr(args: [a.task.title]), ToastType.info),
                      onComplete: () =>
                          finish(service.complete, (a) => 'prog.completedToast'.tr(args: [a.task.title]), ToastType.success),
                      onDismiss: () => finish(service.dismiss, (_) => 'alarm.dismissed'.tr(), ToastType.info),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}
