import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../config/constants.dart';
import '../config/theme.dart';
import '../models/classic_task.dart';
import '../models/programmable_task.dart';
import '../utils/date_formatter.dart';
import 'image_picker_widget.dart';

/// Classic Todo list item (web .task-item): checkbox, text (double-tap to edit),
/// created date, optional image, and 🖼️ ✏️ 🗑️ actions (+ share on mobile).
class ClassicTaskCard extends StatelessWidget {
  const ClassicTaskCard({
    super.key,
    required this.task,
    required this.uploading,
    required this.onToggle,
    required this.onEdit,
    required this.onDelete,
    required this.onAttach,
    required this.onRemoveImage,
    required this.onShare,
  });

  final ClassicTask task;
  final bool uploading;
  final VoidCallback onToggle;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final VoidCallback onAttach;
  final VoidCallback onRemoveImage;
  final VoidCallback onShare;

  @override
  Widget build(BuildContext context) {
    final p = AppPalette.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.md),
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: p.border))),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Checkbox(value: task.completed, onChanged: (_) => onToggle()),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                GestureDetector(
                  onDoubleTap: onEdit,
                  child: Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Text(
                      task.text,
                      style: TextStyle(
                        fontSize: 16,
                        color: task.completed ? p.textSecondary : p.textPrimary,
                        decoration: task.completed ? TextDecoration.lineThrough : null,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text('📅 ${DateFormatter.created(task.createdAt)}', style: TextStyle(fontSize: 12, color: p.textSecondary)),
                if (task.imagePath != null)
                  Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.sm, right: AppSpacing.sm),
                    child: ImageThumbnail(path: task.imagePath!, onRemove: onRemoveImage),
                  ),
              ],
            ),
          ),
          _ActionIcon(
            emoji: '🖼️',
            tooltip: 'classic.attachImage'.tr(),
            onPressed: uploading ? null : onAttach,
            busy: uploading,
          ),
          _ActionIcon(emoji: '✏️', tooltip: 'common.edit'.tr(), onPressed: onEdit),
          _ActionIcon(emoji: '🗑️', tooltip: 'common.delete'.tr(), onPressed: onDelete),
          _ActionIcon(icon: Icons.share_outlined, tooltip: 'common.share'.tr(), onPressed: onShare),
        ],
      ),
    );
  }
}

class _ActionIcon extends StatelessWidget {
  const _ActionIcon({this.emoji, this.icon, required this.tooltip, required this.onPressed, this.busy = false});

  final String? emoji;
  final IconData? icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: tooltip,
      visualDensity: VisualDensity.compact,
      onPressed: onPressed,
      icon: busy
          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
          : emoji != null
              ? Text(emoji!, style: const TextStyle(fontSize: 18))
              : Icon(icon, size: 20, color: AppPalette.of(context).textSecondary),
    );
  }
}

/// Programmable Todo card (web .task-card): priority/overdue border, meta chips,
/// image link and actions (+ share and add-to-calendar on mobile).
class ProgrammableTaskCard extends StatelessWidget {
  const ProgrammableTaskCard({
    super.key,
    required this.task,
    required this.uploading,
    required this.onToggle,
    required this.onEdit,
    required this.onDelete,
    required this.onAttach,
    required this.onRemoveImage,
    required this.onShare,
    required this.onAddToCalendar,
  });

  final ProgrammableTask task;
  final bool uploading;
  final VoidCallback onToggle;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final VoidCallback onAttach;
  final VoidCallback onRemoveImage;
  final VoidCallback onShare;
  final VoidCallback onAddToCalendar;

  static Color priorityColor(TaskPriority priority) => switch (priority) {
        TaskPriority.high => AppPalette.danger,
        TaskPriority.medium => AppPalette.warning,
        TaskPriority.low => AppPalette.success,
      };

  @override
  Widget build(BuildContext context) {
    final p = AppPalette.of(context);
    final now = DateTime.now();
    final overdue = task.isOverdue(now);
    final dueSoon = task.isDueSoon(now);
    final locale = context.locale.languageCode;

    return Opacity(
      opacity: task.completed ? 0.6 : 1,
      child: Container(
        decoration: BoxDecoration(
          color: p.bgPrimary,
          borderRadius: BorderRadius.circular(AppRadius.md),
          border: Border.all(color: p.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Web: 4px left border, red when overdue, otherwise the priority colour.
              Container(width: 4, color: overdue ? AppPalette.danger : priorityColor(task.priority)),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SizedBox(
                            width: 28,
                            height: 28,
                            child: Checkbox(value: task.completed, onChanged: (_) => onToggle()),
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  task.title,
                                  style: TextStyle(
                                    fontSize: 17,
                                    fontWeight: FontWeight.w600,
                                    color: p.textPrimary,
                                    decoration: task.completed ? TextDecoration.lineThrough : null,
                                  ),
                                ),
                                if (task.description.isNotEmpty)
                                  Padding(
                                    padding: const EdgeInsets.only(top: AppSpacing.xs),
                                    child: Text(task.description, style: TextStyle(color: p.textSecondary)),
                                  ),
                                if (uploading)
                                  const Padding(padding: EdgeInsets.only(top: AppSpacing.sm), child: Text('⏳ …'))
                                else if (task.imagePath != null)
                                  Padding(
                                    padding: const EdgeInsets.only(top: AppSpacing.sm),
                                    child: InkWell(
                                      onTap: () => showImageViewer(context, task.imagePath!),
                                      child: Text(
                                        'prog.viewImage'.tr(),
                                        style: const TextStyle(color: AppPalette.accent, decoration: TextDecoration.underline),
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      Wrap(
                        spacing: AppSpacing.xs,
                        runSpacing: AppSpacing.xs,
                        children: [
                          _MetaChip('📅 ${DateFormatter.due(task.dueDateTime, locale)}'),
                          _MetaChip('⏰ ${DateFormatter.relative(task.dueDateTime, now: now)}',
                              highlight: dueSoon ? AppPalette.warning : (overdue ? AppPalette.danger : null)),
                          _MetaChip(
                            '${task.priority.icon} ${'prog.priorities.${task.priority.name}'.tr().toUpperCase()}',
                            highlight: priorityColor(task.priority),
                          ),
                          _MetaChip('${task.category.icon} ${'prog.categories.${task.category.name}'.tr()}'),
                          if (task.reminderMinutes > 0) _MetaChip('prog.reminderBadge'.tr(args: ['${task.reminderMinutes}'])),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      Wrap(
                        spacing: AppSpacing.xs,
                        runSpacing: AppSpacing.xs,
                        children: [
                          _SmallButton(
                            label: task.imagePath == null ? 'prog.addImage'.tr() : 'prog.changeImage'.tr(),
                            onPressed: uploading ? null : onAttach,
                          ),
                          if (task.imagePath != null)
                            _SmallButton(label: 'prog.removeImage'.tr(), onPressed: onRemoveImage, color: AppPalette.danger),
                          _SmallButton(label: '✏️ ${'common.edit'.tr()}', onPressed: onEdit),
                          _SmallButton(label: '🗑️ ${'common.delete'.tr()}', onPressed: onDelete, color: AppPalette.danger),
                          _SmallButton(label: '📤 ${'common.share'.tr()}', onPressed: onShare),
                          _SmallButton(label: '📆 ${'common.addToCalendar'.tr()}', onPressed: onAddToCalendar),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip(this.text, {this.highlight});

  final String text;
  final Color? highlight;

  @override
  Widget build(BuildContext context) {
    final p = AppPalette.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: 3),
      decoration: BoxDecoration(
        color: highlight?.withValues(alpha: 0.15) ?? p.bgSecondary,
        borderRadius: BorderRadius.circular(AppRadius.sm),
        border: Border.all(color: highlight?.withValues(alpha: 0.5) ?? p.border),
      ),
      child: Text(text, style: TextStyle(fontSize: 12, color: highlight ?? p.textSecondary, fontWeight: FontWeight.w500)),
    );
  }
}

class _SmallButton extends StatelessWidget {
  const _SmallButton({required this.label, required this.onPressed, this.color});

  final String label;
  final VoidCallback? onPressed;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: color,
        visualDensity: VisualDensity.compact,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        textStyle: const TextStyle(fontSize: 12),
      ),
      child: Text(label),
    );
  }
}
