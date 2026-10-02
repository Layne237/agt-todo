import 'package:easy_localization/easy_localization.dart';

/// Date/time formatting matching the web app.
class DateFormatter {
  DateFormatter._();

  /// Classic Todo created date: `dd/MM/yyyy HH:mm` (web formatDate()).
  static String created(DateTime date) => DateFormat('dd/MM/yyyy HH:mm').format(date);

  /// Due date in the user's language, e.g. "10/2/2026 17:30" / "02/10/2026 17:30".
  static String due(DateTime date, String locale) => DateFormat.yMd(locale).add_Hm().format(date);

  static String time(DateTime date, String locale) => DateFormat.Hms(locale).format(date);

  /// "in 5 min" / "2 h ago" (web formatRelativeTime()).
  static String relative(DateTime date, {DateTime? now}) {
    final diff = date.difference(now ?? DateTime.now());
    final minutes = diff.inMinutes.abs();
    final hours = minutes ~/ 60;
    final days = hours ~/ 24;
    if (!diff.isNegative) {
      if (minutes < 60) return 'prog.inMinutes'.tr(args: ['$minutes']);
      if (hours < 24) return 'prog.inHours'.tr(args: ['$hours']);
      return 'prog.inDays'.tr(args: ['$days']);
    }
    if (minutes < 60) return 'prog.minutesAgo'.tr(args: ['$minutes']);
    if (hours < 24) return 'prog.hoursAgo'.tr(args: ['$hours']);
    return 'prog.daysAgo'.tr(args: ['$days']);
  }

  /// Alarm countdown: "4:32", or "1h 05m" above an hour (web formatDuration()).
  static String countdown(Duration duration) {
    final total = duration.inSeconds.abs();
    final hours = total ~/ 3600;
    final minutes = (total % 3600) ~/ 60;
    final seconds = (total % 60).toString().padLeft(2, '0');
    if (hours > 0) return '${hours}h ${minutes.toString().padLeft(2, '0')}m';
    return '$minutes:$seconds';
  }
}
