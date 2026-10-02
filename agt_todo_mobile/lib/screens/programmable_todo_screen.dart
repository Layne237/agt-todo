import 'dart:async';

import 'package:add_2_calendar/add_2_calendar.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../config/constants.dart';
import '../config/theme.dart';
import '../models/programmable_task.dart';
import '../providers/programmable_todo_provider.dart';
import '../services/alarm_service.dart';
import '../services/image_service.dart';
import '../services/notification_service.dart';
import '../utils/date_formatter.dart';
import '../utils/validators.dart';
import '../widgets/alarm_status_banner.dart';
import '../widgets/dev_menu.dart';
import '../widgets/filter_tabs.dart';
import '../widgets/image_picker_widget.dart';
import '../widgets/missed_alarms_section.dart';
import '../widgets/mode_app_bar.dart';
import '../widgets/stats_bar.dart';
import '../widgets/task_card.dart';
import '../widgets/toast.dart';

/// Programmable Todo (web programmable/index.html).
class ProgrammableTodoScreen extends StatefulWidget {
  const ProgrammableTodoScreen({super.key});

  @override
  State<ProgrammableTodoScreen> createState() => _ProgrammableTodoScreenState();
}

class _ProgrammableTodoScreenState extends State<ProgrammableTodoScreen> {
  final _bannerKey = GlobalKey<AlarmStatusBannerState>();
  StreamSubscription<int>? _missedSubscription;
  final List<DateTime> _logoTaps = [];

  @override
  void initState() {
    super.initState();
    // "N tasks were missed while you were away".
    _missedSubscription = AlarmService.instance.missedAnnouncements.listen((count) {
      if (mounted) showToast(context, 'missed.announce'.tr(args: ['$count']), type: ToastType.error);
    });
  }

  @override
  void dispose() {
    _missedSubscription?.cancel();
    super.dispose();
  }

  /// 5 taps on the title within 3 s opens the hidden dev menu (web: tap the logo 5 times).
  void _onBrandTap() {
    final now = DateTime.now();
    _logoTaps
      ..removeWhere((t) => now.difference(t) > const Duration(seconds: 3))
      ..add(now);
    if (_logoTaps.length >= 5) {
      _logoTaps.clear();
      showDevMenu(context);
    }
  }

  Future<void> _edit(ProgrammableTask task) async {
    final provider = context.read<ProgrammableTodoProvider>();
    final title = await promptDialog(
      context,
      title: 'prog.editTitle'.tr(),
      initialValue: task.title,
      maxLength: AppConstants.titleMaxLength,
      saveLabel: 'common.save'.tr(),
      cancelLabel: 'common.cancel'.tr(),
    );
    if (title == null || title.trim().isEmpty || title == task.title) return;
    await provider.editTitle(task.id, title);
    if (mounted) showToast(context, 'prog.updated'.tr(), type: ToastType.success);
  }

  Future<void> _delete(ProgrammableTask task) async {
    final provider = context.read<ProgrammableTodoProvider>();
    final confirmed = await confirmDialog(context, 'prog.confirmDelete'.tr(),
        confirmLabel: 'common.delete'.tr(), cancelLabel: 'common.cancel'.tr());
    if (!confirmed) return;
    await provider.delete(task.id);
    if (mounted) showToast(context, 'prog.deleted'.tr(), type: ToastType.success);
  }

  Future<void> _toggle(ProgrammableTask task) async {
    final updated = await context.read<ProgrammableTodoProvider>().toggle(task.id);
    if (updated != null && updated.completed && mounted) {
      showToast(context, 'prog.completedToast'.tr(args: [updated.title]), type: ToastType.success);
    }
  }

  Future<void> _attach(ProgrammableTask task) async {
    final provider = context.read<ProgrammableTodoProvider>();
    final fromCamera = await showImageSourceSheet(context);
    if (fromCamera == null) return;
    try {
      final attached = await provider.attachImage(task.id, fromCamera: fromCamera);
      if (attached && mounted) showToast(context, 'prog.imageAttached'.tr(), type: ToastType.success);
    } on ImageTooLargeException {
      if (mounted) showToast(context, 'common.imageTooLarge'.tr(), type: ToastType.error);
    } catch (_) {
      if (mounted) showToast(context, 'common.imageFailed'.tr(), type: ToastType.error);
    }
  }

  Future<void> _removeImage(ProgrammableTask task) async {
    final provider = context.read<ProgrammableTodoProvider>();
    final confirmed = await confirmDialog(context, 'prog.confirmRemoveImage'.tr(),
        confirmLabel: 'common.remove'.tr(), cancelLabel: 'common.cancel'.tr());
    if (!confirmed) return;
    await provider.removeImage(task.id);
    if (mounted) showToast(context, 'prog.imageRemoved'.tr(), type: ToastType.success);
  }

  void _share(ProgrammableTask task) {
    final text = 'prog.shareText'.tr(namedArgs: {
      'title': task.title,
      'due': DateFormatter.due(task.dueDateTime, context.locale.languageCode),
      'priority': '${task.priority.icon} ${'prog.priorities.${task.priority.name}'.tr()}',
    });
    SharePlus.instance.share(ShareParams(
      text: task.description.isEmpty ? text : '$text\n\n${task.description}',
      files: task.imagePath != null ? [XFile(task.imagePath!)] : null,
    ));
  }

  Future<void> _addToCalendar(ProgrammableTask task) async {
    final ok = await Add2Calendar.addEvent2Cal(Event(
      title: task.title,
      description: task.description,
      startDate: task.dueDateTime,
      endDate: task.dueDateTime.add(const Duration(minutes: 30)),
      iosParams: IOSParams(reminder: task.reminderMinutes > 0 ? Duration(minutes: task.reminderMinutes) : null),
    ));
    if (!ok && mounted) showToast(context, 'common.calendarFailed'.tr(), type: ToastType.error);
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<ProgrammableTodoProvider>();
    final stats = provider.stats;
    final tasks = provider.tasks;

    return Scaffold(
      appBar: ModeAppBar(icon: '⏰', title: 'prog.title'.tr(), isClassic: false, onBrandTap: _onBrandTap),
      body: SafeArea(
        child: !provider.loaded
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: () async {
                  await provider.load();
                  await _bannerKey.currentState?.refresh();
                },
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 900),
                    child: CustomScrollView(
                      slivers: [
                        SliverPadding(
                          padding: const EdgeInsets.all(AppSpacing.md),
                          sliver: SliverList.list(children: [
                            AlarmStatusBanner(key: _bannerKey),
                            const MissedAlarmsSection(),
                            _TaskForm(onAdded: () => _bannerKey.currentState?.refresh()),
                            const SizedBox(height: AppSpacing.lg),
                            StatsBar(items: [
                              ('prog.statTotal'.tr(), stats.total),
                              ('prog.statCompleted'.tr(), stats.completed),
                              ('prog.statUpcoming'.tr(), stats.upcoming),
                              ('prog.statOverdue'.tr(), stats.overdue),
                            ]),
                            const SizedBox(height: AppSpacing.lg),
                            FilterTabs<ProgrammableFilter>(
                              values: ProgrammableFilter.values,
                              labelOf: (f) => switch (f) {
                                ProgrammableFilter.all => 'prog.filterAll'.tr(),
                                ProgrammableFilter.upcoming => 'prog.filterUpcoming'.tr(),
                                ProgrammableFilter.overdue => 'prog.filterOverdue'.tr(),
                                ProgrammableFilter.completed => 'prog.filterCompleted'.tr(),
                              },
                              selected: provider.filter,
                              onSelected: provider.setFilter,
                            ),
                            const SizedBox(height: AppSpacing.md),
                          ]),
                        ),
                        if (tasks.isEmpty)
                          SliverToBoxAdapter(child: _EmptyState())
                        else
                          SliverPadding(
                            padding: const EdgeInsets.fromLTRB(AppSpacing.md, 0, AppSpacing.md, AppSpacing.xl),
                            sliver: SliverList.separated(
                              itemCount: tasks.length,
                              separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
                              itemBuilder: (context, index) {
                                final task = tasks[index];
                                return ProgrammableTaskCard(
                                  key: ValueKey(task.id),
                                  task: task,
                                  uploading: provider.uploadingTaskId == task.id,
                                  onToggle: () => _toggle(task),
                                  onEdit: () => _edit(task),
                                  onDelete: () => _delete(task),
                                  onAttach: () => _attach(task),
                                  onRemoveImage: () => _removeImage(task),
                                  onShare: () => _share(task),
                                  onAddToCalendar: () => _addToCalendar(task),
                                );
                              },
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final p = AppPalette.of(context);
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.xl),
      child: Column(
        children: [
          const Text('📭', style: TextStyle(fontSize: 56)),
          const SizedBox(height: AppSpacing.sm),
          Text('prog.empty'.tr(), style: TextStyle(fontSize: 16, color: p.textSecondary)),
          Text('prog.emptyHint'.tr(), style: TextStyle(fontSize: 13, color: p.textSecondary)),
        ],
      ),
    );
  }
}

/// "📅 Create Smart Task" form (web .add-task-section).
class _TaskForm extends StatefulWidget {
  const _TaskForm({required this.onAdded});

  final VoidCallback onAdded;

  @override
  State<_TaskForm> createState() => _TaskFormState();
}

class _TaskFormState extends State<_TaskForm> {
  final _title = TextEditingController();
  final _description = TextEditingController();
  late DateTime _date;
  late TimeOfDay _time;
  TaskPriority _priority = TaskPriority.medium;
  TaskCategory _category = TaskCategory.work;
  int _reminder = 0;

  @override
  void initState() {
    super.initState();
    _resetDue();
  }

  /// Default due date/time = now (web behaviour).
  void _resetDue() {
    final now = DateTime.now();
    _date = DateTime(now.year, now.month, now.day);
    _time = TimeOfDay.fromDateTime(now);
  }

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 10),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(context: context, initialTime: _time);
    if (picked != null) setState(() => _time = picked);
  }

  Future<void> _submit() async {
    final titleError = Validators.taskTitle(_title.text);
    if (titleError != null) return showToast(context, titleError.tr(), type: ToastType.error);

    final provider = context.read<ProgrammableTodoProvider>();
    final notifications = NotificationService.instance;

    // Ask for notification permission on the first task (not at app start), like the web app.
    final permissions = await notifications.permissions();
    if (!permissions.notifications && !permissions.notificationsPermanentlyDenied) {
      await notifications.requestNotifications();
    }

    await provider.add(
      title: _title.text,
      description: _description.text,
      due: DateTime(_date.year, _date.month, _date.day, _time.hour, _time.minute),
      priority: _priority,
      category: _category,
      reminderMinutes: _reminder,
    );
    _title.clear();
    _description.clear();
    setState(_resetDue);
    widget.onAdded();
    if (mounted) showToast(context, 'prog.added'.tr(), type: ToastType.success);
  }

  String _reminderLabel(int minutes) => switch (minutes) {
        0 => 'prog.noReminder'.tr(),
        60 => 'prog.hourBefore'.tr(),
        _ => 'prog.minutesBefore'.tr(args: ['$minutes']),
      };

  @override
  Widget build(BuildContext context) {
    final p = AppPalette.of(context);
    final locale = context.locale.languageCode;
    InputDecoration label(String text) => InputDecoration(labelText: text);

    Widget pickerField(String labelText, String value, VoidCallback onTap, IconData icon) => InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppRadius.md),
          child: InputDecorator(
            decoration: InputDecoration(labelText: labelText, suffixIcon: Icon(icon, size: 20)),
            child: Text(value),
          ),
        );

    final dateField = pickerField('prog.dueDate'.tr(), DateFormat.yMd(locale).format(_date), _pickDate, Icons.calendar_today);
    final timeField = pickerField('prog.dueTime'.tr(), _time.format(context), _pickTime, Icons.schedule);
    final priorityField = DropdownButtonFormField<TaskPriority>(
      initialValue: _priority,
      decoration: label('prog.priority'.tr()),
      items: [
        for (final priority in TaskPriority.values)
          DropdownMenuItem(value: priority, child: Text('${priority.icon} ${'prog.priorities.${priority.name}'.tr()}')),
      ],
      onChanged: (value) => setState(() => _priority = value ?? _priority),
    );
    final categoryField = DropdownButtonFormField<TaskCategory>(
      initialValue: _category,
      decoration: label('prog.category'.tr()),
      items: [
        for (final category in TaskCategory.values)
          DropdownMenuItem(value: category, child: Text('${category.icon} ${'prog.categories.${category.name}'.tr()}')),
      ],
      onChanged: (value) => setState(() => _category = value ?? _category),
    );

    Widget pair(Widget a, Widget b) => Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [Expanded(child: a), const SizedBox(width: AppSpacing.md), Expanded(child: b)],
        );

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('prog.createTitle'.tr(), style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: p.textPrimary)),
            const SizedBox(height: AppSpacing.md),
            TextField(
              controller: _title,
              maxLength: AppConstants.titleMaxLength,
              textInputAction: TextInputAction.next,
              decoration: InputDecoration(hintText: 'prog.taskTitle'.tr(), counterText: ''),
            ),
            const SizedBox(height: AppSpacing.md),
            TextField(
              controller: _description,
              maxLength: AppConstants.descriptionMaxLength,
              minLines: 2,
              maxLines: 4,
              decoration: InputDecoration(hintText: 'prog.description'.tr(), counterText: ''),
            ),
            const SizedBox(height: AppSpacing.md),
            pair(dateField, timeField),
            const SizedBox(height: AppSpacing.md),
            pair(priorityField, categoryField),
            const SizedBox(height: AppSpacing.md),
            DropdownButtonFormField<int>(
              initialValue: _reminder,
              decoration: label('prog.reminder'.tr()),
              items: [
                for (final minutes in AppConstants.reminderOptions)
                  DropdownMenuItem(value: minutes, child: Text(_reminderLabel(minutes))),
              ],
              onChanged: (value) => setState(() => _reminder = value ?? 0),
            ),
            const SizedBox(height: AppSpacing.md),
            FilledButton(onPressed: _submit, child: Text('prog.addTask'.tr())),
          ],
        ),
      ),
    );
  }
}
