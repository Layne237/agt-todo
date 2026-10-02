import 'dart:async';

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../config/constants.dart';
import '../config/theme.dart';
import '../models/classic_task.dart';
import '../providers/classic_todo_provider.dart';
import '../services/image_service.dart';
import '../utils/date_formatter.dart';
import '../utils/validators.dart';
import '../widgets/filter_tabs.dart';
import '../widgets/image_picker_widget.dart';
import '../widgets/mode_app_bar.dart';
import '../widgets/task_card.dart';
import '../widgets/toast.dart';

/// Classic Todo (web classic/index.html).
class ClassicTodoScreen extends StatefulWidget {
  const ClassicTodoScreen({super.key});

  @override
  State<ClassicTodoScreen> createState() => _ClassicTodoScreenState();
}

class _ClassicTodoScreenState extends State<ClassicTodoScreen> {
  final _input = TextEditingController();
  final _focus = FocusNode();
  String? _error;
  Timer? _errorTimer;

  @override
  void dispose() {
    _input.dispose();
    _focus.dispose();
    _errorTimer?.cancel();
    super.dispose();
  }

  /// Inline red error under the input for 3 s (web showError()).
  void _showError(String key) {
    _errorTimer?.cancel();
    setState(() => _error = key.tr());
    _errorTimer = Timer(const Duration(seconds: 3), () {
      if (mounted) setState(() => _error = null);
    });
  }

  Future<void> _add() async {
    final error = Validators.classicTask(_input.text);
    if (error != null) return _showError(error);
    await context.read<ClassicTodoProvider>().add(_input.text);
    _input.clear();
    _focus.requestFocus();
    if (mounted) showToast(context, 'classic.added'.tr(), type: ToastType.success);
  }

  Future<void> _edit(ClassicTask task) async {
    final text = await promptDialog(
      context,
      title: 'classic.editTitle'.tr(),
      initialValue: task.text,
      maxLength: AppConstants.classicMaxLength,
      saveLabel: 'common.save'.tr(),
      cancelLabel: 'common.cancel'.tr(),
    );
    if (text == null || text == task.text || !mounted) return;
    final ok = await context.read<ClassicTodoProvider>().edit(task.id, text);
    if (!mounted) return;
    ok ? showToast(context, 'classic.updated'.tr(), type: ToastType.success) : _showError('classic.errorEditEmpty');
  }

  Future<void> _delete(ClassicTask task) async {
    final provider = context.read<ClassicTodoProvider>();
    final confirmed = await confirmDialog(context, 'classic.confirmDelete'.tr(),
        confirmLabel: 'common.delete'.tr(), cancelLabel: 'common.cancel'.tr());
    if (!confirmed) return;
    await provider.delete(task.id);
    if (mounted) showToast(context, 'classic.deleted'.tr(), type: ToastType.success);
  }

  Future<void> _clearCompleted() async {
    final provider = context.read<ClassicTodoProvider>();
    final count = provider.completedCount;
    if (count == 0) return _showError('classic.noCompleted');
    final confirmed = await confirmDialog(context, 'classic.confirmClear'.tr(args: ['$count']),
        confirmLabel: 'common.delete'.tr(), cancelLabel: 'common.cancel'.tr());
    if (!confirmed) return;
    final cleared = await provider.clearCompleted();
    if (mounted) showToast(context, 'classic.cleared'.tr(args: ['$cleared']), type: ToastType.success);
  }

  Future<void> _attach(ClassicTask task) async {
    final provider = context.read<ClassicTodoProvider>();
    final fromCamera = await showImageSourceSheet(context);
    if (fromCamera == null) return;
    try {
      final attached = await provider.attachImage(task.id, fromCamera: fromCamera);
      if (attached && mounted) showToast(context, 'classic.imageAttached'.tr(), type: ToastType.success);
    } on ImageTooLargeException {
      if (mounted) _showError('common.imageTooLarge');
    } catch (_) {
      if (mounted) _showError('common.imageFailed');
    }
  }

  Future<void> _removeImage(ClassicTask task) async {
    final provider = context.read<ClassicTodoProvider>();
    final confirmed = await confirmDialog(context, 'classic.confirmRemoveImage'.tr(),
        confirmLabel: 'common.remove'.tr(), cancelLabel: 'common.cancel'.tr());
    if (!confirmed) return;
    await provider.removeImage(task.id);
    if (mounted) showToast(context, 'classic.imageRemoved'.tr(), type: ToastType.success);
  }

  void _share(ClassicTask task) {
    final text = '${task.completed ? '✅' : '⬜'} ${task.text}\n📅 ${DateFormatter.created(task.createdAt)}';
    SharePlus.instance.share(ShareParams(
      text: text,
      files: task.imagePath != null ? [XFile(task.imagePath!)] : null,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<ClassicTodoProvider>();
    final p = AppPalette.of(context);
    final tasks = provider.tasks;

    return Scaffold(
      appBar: ModeAppBar(icon: '📝', title: 'classic.title'.tr(), isClassic: true),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 700),
            child: Card(
              margin: const EdgeInsets.all(AppSpacing.md),
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.md),
                child: Column(
                  children: [
                    // Add task
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _input,
                            focusNode: _focus,
                            maxLength: AppConstants.classicMaxLength,
                            textInputAction: TextInputAction.done,
                            onSubmitted: (_) => _add(),
                            decoration: InputDecoration(hintText: 'classic.placeholder'.tr(), counterText: ''),
                          ),
                        ),
                        const SizedBox(width: AppSpacing.sm),
                        SizedBox(height: 52, child: FilledButton(onPressed: _add, child: Text('classic.add'.tr()))),
                      ],
                    ),
                    if (_error != null)
                      Container(
                        width: double.infinity,
                        margin: const EdgeInsets.only(top: AppSpacing.sm),
                        padding: const EdgeInsets.all(AppSpacing.sm),
                        decoration: BoxDecoration(
                          color: AppPalette.danger.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(AppRadius.sm),
                          border: Border.all(color: AppPalette.danger),
                        ),
                        child: Text(_error!, style: const TextStyle(color: AppPalette.danger, fontWeight: FontWeight.w600)),
                      ),
                    const SizedBox(height: AppSpacing.md),

                    // Filters + clear completed
                    Row(
                      children: [
                        Expanded(
                          child: FilterTabs<ClassicFilter>(
                            values: ClassicFilter.values,
                            labelOf: (f) => 'classic.${f.name}'.tr(),
                            selected: provider.filter,
                            onSelected: provider.setFilter,
                          ),
                        ),
                        TextButton(
                          onPressed: _clearCompleted,
                          style: TextButton.styleFrom(foregroundColor: AppPalette.danger),
                          child: Text('classic.clearCompleted'.tr()),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.sm),

                    // List
                    Expanded(
                      child: !provider.loaded
                          ? const Center(child: CircularProgressIndicator())
                          : tasks.isEmpty
                              ? _EmptyState(
                                  title: provider.allTasks.isEmpty ? 'classic.empty'.tr() : 'classic.noTasks'.tr(),
                                  hint: provider.allTasks.isEmpty ? 'classic.emptyHint'.tr() : null,
                                )
                              : ListView.builder(
                                  itemCount: tasks.length,
                                  itemBuilder: (context, index) {
                                    final task = tasks[index];
                                    return ClassicTaskCard(
                                      key: ValueKey(task.id),
                                      task: task,
                                      uploading: provider.uploadingTaskId == task.id,
                                      onToggle: () => provider.toggle(task.id),
                                      onEdit: () => _edit(task),
                                      onDelete: () => _delete(task),
                                      onAttach: () => _attach(task),
                                      onRemoveImage: () => _removeImage(task),
                                      onShare: () => _share(task),
                                    );
                                  },
                                ),
                    ),

                    // Footer: "N tasks remaining"
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.only(top: AppSpacing.md),
                      decoration: BoxDecoration(border: Border(top: BorderSide(color: p.border))),
                      child: Text(
                        'classic.remaining'.tr(args: ['${provider.remainingCount}']),
                        textAlign: TextAlign.center,
                        style: TextStyle(color: p.textSecondary),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.title, this.hint});

  final String title;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    final p = AppPalette.of(context);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('📭', style: TextStyle(fontSize: 56)),
          const SizedBox(height: AppSpacing.sm),
          Text(title, style: TextStyle(fontSize: 16, color: p.textSecondary)),
          if (hint != null) Text(hint!, style: TextStyle(fontSize: 13, color: p.textSecondary)),
        ],
      ),
    );
  }
}
