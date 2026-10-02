import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/constants.dart';
import '../config/theme.dart';
import '../models/programmable_task.dart';
import '../providers/programmable_todo_provider.dart';
import '../utils/date_formatter.dart';
import '../utils/validators.dart';
import 'toast.dart';

/// "⚠️ Missed Alarms" (web .missed-alarms-section): alarms that went off while
/// the user was away, with Complete / +1 hour / Reschedule / dismiss.
class MissedAlarmsSection extends StatelessWidget {
  const MissedAlarmsSection({super.key});

  Future<void> _reschedule(BuildContext context, ProgrammableTask task) async {
    final provider = context.read<ProgrammableTodoProvider>();
    final now = DateTime.now();
    final suggested = now.add(const Duration(hours: 1));
    final date = await showDatePicker(
      context: context,
      initialDate: suggested,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 3650)),
    );
    if (date == null || !context.mounted) return;
    final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(suggested));
    if (time == null || !context.mounted) return;

    final when = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    final error = Validators.futureDate(when);
    if (error != null) return showToast(context, error.tr(), type: ToastType.error);
    await provider.rescheduleMissed(task.id, when);
    if (context.mounted) {
      showToast(context, 'missed.rescheduled'.tr(args: [DateFormatter.due(when, context.locale.languageCode)]), type: ToastType.success);
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<ProgrammableTodoProvider>();
    final missed = provider.missed;
    if (missed.isEmpty) return const SizedBox.shrink();
    final p = AppPalette.of(context);
    final locale = context.locale.languageCode;

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.md),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppPalette.danger.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: AppPalette.danger, width: 2),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('missed.title'.tr(), style: const TextStyle(color: AppPalette.danger, fontWeight: FontWeight.bold, fontSize: 17)),
              const SizedBox(width: AppSpacing.sm),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: 1),
                decoration: BoxDecoration(color: AppPalette.danger, borderRadius: BorderRadius.circular(99)),
                child: Text('${missed.length}', style: const TextStyle(color: Colors.white, fontSize: 12)),
              ),
            ],
          ),
          Text('missed.subtitle'.tr(), style: TextStyle(fontSize: 13, color: p.textSecondary)),
          const SizedBox(height: AppSpacing.sm),
          for (final (alarm, task) in missed)
            Container(
              margin: const EdgeInsets.only(top: AppSpacing.sm),
              padding: const EdgeInsets.all(AppSpacing.sm),
              decoration: BoxDecoration(
                color: p.bgSecondary,
                borderRadius: BorderRadius.circular(AppRadius.sm),
                border: Border.all(color: p.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(task.title, style: const TextStyle(fontWeight: FontWeight.bold)),
                  Text(
                    '${alarm.kind == AlarmKind.reminder ? 'missed.reminder'.tr() : 'missed.due'.tr()} · '
                    '${DateFormatter.due(alarm.at, locale)} (${DateFormatter.relative(alarm.at)})',
                    style: TextStyle(fontSize: 12, color: p.textSecondary),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Wrap(
                    spacing: AppSpacing.xs,
                    runSpacing: AppSpacing.xs,
                    children: [
                      FilledButton(
                        style: FilledButton.styleFrom(
                          backgroundColor: AppPalette.success,
                          visualDensity: VisualDensity.compact,
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                        ),
                        onPressed: () async {
                          await provider.completeMissed(task.id);
                          if (context.mounted) showToast(context, 'missed.taskCompleted'.tr(), type: ToastType.success);
                        },
                        child: Text('missed.complete'.tr()),
                      ),
                      OutlinedButton(
                        style: OutlinedButton.styleFrom(visualDensity: VisualDensity.compact),
                        onPressed: () async {
                          final when = DateTime.now().add(const Duration(hours: 1));
                          await provider.rescheduleMissed(task.id, when);
                          if (context.mounted) {
                            showToast(context, 'missed.rescheduled'.tr(args: [DateFormatter.due(when, locale)]), type: ToastType.success);
                          }
                        },
                        child: Text('missed.plusHour'.tr()),
                      ),
                      OutlinedButton(
                        style: OutlinedButton.styleFrom(visualDensity: VisualDensity.compact),
                        onPressed: () => _reschedule(context, task),
                        child: Text('missed.reschedule'.tr()),
                      ),
                      IconButton(
                        tooltip: 'alarm.actionDismiss'.tr(),
                        visualDensity: VisualDensity.compact,
                        onPressed: () => provider.dismissMissed(task.id),
                        icon: const Icon(Icons.close, size: 18),
                      ),
                    ],
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
