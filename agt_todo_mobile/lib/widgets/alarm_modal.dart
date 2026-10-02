import 'dart:async';

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../config/constants.dart';
import '../config/theme.dart';
import '../services/alarm_service.dart';
import '../utils/date_formatter.dart';

/// Ringing alarm card (web .alarm-modal-content): shaking clock, kind label,
/// task details, live countdown, "fired at" time, and Snooze / Complete / Dismiss.
class AlarmModal extends StatefulWidget {
  const AlarmModal({
    super.key,
    required this.alarm,
    required this.onSnooze,
    required this.onComplete,
    required this.onDismiss,
  });

  final ActiveAlarm alarm;
  final VoidCallback onSnooze;
  final VoidCallback onComplete;
  final VoidCallback onDismiss;

  @override
  State<AlarmModal> createState() => _AlarmModalState();
}

class _AlarmModalState extends State<AlarmModal> with TickerProviderStateMixin {
  late final AnimationController _shake =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 400))..repeat(reverse: true);
  late final AnimationController _pulse = AnimationController(vsync: this, duration: const Duration(seconds: 1))..repeat(reverse: true);
  late final Timer _ticker;

  @override
  void initState() {
    super.initState();
    // Live countdown.
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _ticker.cancel();
    _shake.dispose();
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = AppPalette.of(context);
    final task = widget.alarm.task;
    final locale = context.locale.languageCode;
    final diff = task.effectiveDue.difference(DateTime.now());
    final overdue = diff <= Duration.zero;

    final label = widget.alarm.isTest
        ? 'alarm.test'.tr()
        : (widget.alarm.kind == AlarmKind.reminder ? 'alarm.reminder'.tr() : 'alarm.taskDue'.tr());

    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, child) => Container(
        constraints: const BoxConstraints(maxWidth: 480),
        padding: const EdgeInsets.all(AppSpacing.xl),
        decoration: BoxDecoration(
          color: p.bgSecondary,
          borderRadius: BorderRadius.circular(AppRadius.lg),
          // Pulsing red ring, like the web's alarmPulse animation.
          boxShadow: [
            BoxShadow(
              color: AppPalette.danger.withValues(alpha: 0.3 - 0.15 * _pulse.value),
              spreadRadius: 6 + 8 * _pulse.value,
            ),
          ],
        ),
        child: child,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          RotationTransition(
            turns: Tween(begin: -10 / 360, end: 10 / 360).animate(_shake),
            child: const Text('⏰', style: TextStyle(fontSize: 64)),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(label, style: const TextStyle(color: AppPalette.danger, fontWeight: FontWeight.w700, letterSpacing: 1)),
          const SizedBox(height: AppSpacing.sm),
          Text(task.title, textAlign: TextAlign.center, style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: p.textPrimary)),
          if (task.description.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(task.description, textAlign: TextAlign.center, style: TextStyle(color: p.textSecondary)),
          ],
          const SizedBox(height: AppSpacing.md),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              _chip(context, '${task.priority.icon} ${'prog.priorities.${task.priority.name}'.tr().toUpperCase()}'),
              _chip(context, '${task.category.icon} ${'prog.categories.${task.category.name}'.tr()}'),
              _chip(context, '📅 ${DateFormatter.due(task.dueDateTime, locale)}'),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          Text(
            overdue
                ? 'alarm.overdueBy'.tr(args: [DateFormatter.countdown(diff)])
                : 'alarm.dueIn'.tr(args: [DateFormatter.countdown(diff)]),
            style: TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.w800,
              color: overdue ? AppPalette.danger : AppPalette.accent,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            'alarm.firedAt'.tr(args: [DateFormatter.time(widget.alarm.firedAt, locale)]),
            style: TextStyle(fontSize: 13, color: p.textSecondary),
          ),
          const SizedBox(height: AppSpacing.lg),
          _button('alarm.snooze'.tr(), AppPalette.warning, Colors.white, widget.onSnooze, autofocus: true),
          const SizedBox(height: AppSpacing.sm),
          _button('alarm.complete'.tr(), AppPalette.success, Colors.white, widget.onComplete),
          const SizedBox(height: AppSpacing.sm),
          _button('alarm.dismiss'.tr(), p.bgPrimary, p.textPrimary, widget.onDismiss, border: p.border),
        ],
      ),
    );
  }

  Widget _chip(BuildContext context, String text) {
    final p = AppPalette.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: 4),
      decoration: BoxDecoration(
        color: p.bgPrimary,
        borderRadius: BorderRadius.circular(AppRadius.sm),
        border: Border.all(color: p.border),
      ),
      child: Text(text, style: TextStyle(fontSize: 13, color: p.textPrimary)),
    );
  }

  Widget _button(String label, Color background, Color foreground, VoidCallback onPressed, {Color? border, bool autofocus = false}) {
    return SizedBox(
      width: double.infinity,
      child: FilledButton(
        autofocus: autofocus,
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: background,
          foregroundColor: foreground,
          padding: const EdgeInsets.symmetric(vertical: 16),
          side: border != null ? BorderSide(color: border) : null,
          textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
        ),
        child: Text(label),
      ),
    );
  }
}
