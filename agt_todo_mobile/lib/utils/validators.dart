/// Form validation (same rules and messages as the web app).
/// Each function returns a translation key for the error, or null if valid.
class Validators {
  Validators._();

  static String? classicTask(String? value) => (value ?? '').trim().isEmpty ? 'classic.errorEmpty' : null;

  static String? classicEdit(String? value) => (value ?? '').trim().isEmpty ? 'classic.errorEditEmpty' : null;

  static String? taskTitle(String? value) => (value ?? '').trim().isEmpty ? 'prog.errorTitle' : null;

  static String? dueDateTime(DateTime? date, Object? time) => date == null || time == null ? 'prog.errorDue' : null;

  static String? futureDate(DateTime? value, {DateTime? now}) =>
      value == null || !value.isAfter(now ?? DateTime.now()) ? 'missed.pickFuture' : null;
}
