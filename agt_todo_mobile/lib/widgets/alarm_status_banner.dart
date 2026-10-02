import 'dart:io';

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../providers/programmable_todo_provider.dart';
import '../services/notification_service.dart';
import 'toast.dart';

/// Says whether alarms can ring reliably and offers a one-tap fix
/// (mobile version of the web's alarm status banner):
/// notifications → exact alarms → full-screen alarms → battery tip.
class AlarmStatusBanner extends StatefulWidget {
  const AlarmStatusBanner({super.key});

  @override
  State<AlarmStatusBanner> createState() => AlarmStatusBannerState();
}

class AlarmStatusBannerState extends State<AlarmStatusBanner> with WidgetsBindingObserver {
  final _notifications = NotificationService.instance;
  AlarmPermissions? _permissions;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    refresh();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Coming back from a system settings page: re-check.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) refresh();
  }

  Future<void> refresh() async {
    final before = _permissions;
    final now = await _notifications.permissions();
    if (!mounted) return;
    setState(() => _permissions = now);
    // Exact-alarm permission changes how alarms are scheduled: re-create them.
    if (before != null && (before.exactAlarms != now.exactAlarms || before.notifications != now.notifications)) {
      await _notifications.rescheduleAll(context.read<ProgrammableTodoProvider>().allTasks);
    }
  }

  Future<void> _run(Future<void> Function() action) async {
    await action();
    await refresh();
  }

  @override
  Widget build(BuildContext context) {
    final perms = _permissions;
    if (perms == null) return const SizedBox.shrink();

    late final String icon;
    late final String text;
    late final Color color;
    final actions = <(String, Future<void> Function())>[];

    if (!perms.notifications) {
      icon = perms.notificationsPermanentlyDenied ? '🔕' : '🔔';
      text = perms.notificationsPermanentlyDenied ? 'status.notificationsBlocked'.tr() : 'status.needNotifications'.tr();
      color = perms.notificationsPermanentlyDenied ? AppPalette.danger : AppPalette.warning;
      actions.add(perms.notificationsPermanentlyDenied
          ? ('status.openSettings'.tr(), () async => openAppSettings())
          : ('status.enable'.tr(), () async => _notifications.requestNotifications()));
    } else if (!perms.exactAlarms) {
      icon = '⏰';
      text = 'status.needExact'.tr();
      color = AppPalette.warning;
      actions.add(('status.allow'.tr(), _notifications.requestExactAlarms));
    } else if (!perms.fullScreen) {
      icon = '📱';
      text = 'status.needFullScreen'.tr();
      color = AppPalette.warning;
      actions.add(('status.allow'.tr(), _notifications.requestFullScreen));
    } else {
      icon = '🟢';
      text = 'status.ok'.tr();
      color = AppPalette.success;
      actions.add(('status.test'.tr(), () async {
        await _notifications.showTest();
        if (context.mounted) showToast(context, 'status.testSent'.tr(), type: ToastType.success);
      }));
    }

    final showBatteryTip = Platform.isAndroid && perms.allGood && !perms.batteryUnrestricted;

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.md),
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Text(icon, style: const TextStyle(fontSize: 18)),
              const SizedBox(width: AppSpacing.sm),
              Expanded(child: Text(text, style: const TextStyle(fontSize: 14))),
              for (final (label, action) in actions)
                Padding(
                  padding: const EdgeInsets.only(left: AppSpacing.xs),
                  child: FilledButton(
                    onPressed: () => _run(action),
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                    ),
                    child: Text(label),
                  ),
                ),
            ],
          ),
          if (showBatteryTip)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xs),
              child: Row(
                children: [
                  Expanded(child: Text('status.batteryHint'.tr(), style: const TextStyle(fontSize: 12))),
                  TextButton(onPressed: () => _run(_notifications.requestBatteryExemption), child: Text('status.allow'.tr())),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
