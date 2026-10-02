import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config/constants.dart';

/// Light/dark theme, saved under the same key as the web app ('todo_theme').
/// No saved value = follow the system setting.
class ThemeProvider extends ChangeNotifier {
  ThemeMode _mode = ThemeMode.system;
  ThemeMode get mode => _mode;

  Future<void> load() async {
    final saved = (await SharedPreferences.getInstance()).getString(AppConstants.themeKey);
    _mode = switch (saved) {
      'dark' => ThemeMode.dark,
      'light' => ThemeMode.light,
      _ => ThemeMode.system,
    };
    notifyListeners();
  }

  bool isDark(BuildContext context) =>
      _mode == ThemeMode.dark || (_mode == ThemeMode.system && MediaQuery.platformBrightnessOf(context) == Brightness.dark);

  /// Same as the web toggle: flips between light and dark and remembers it.
  Future<void> toggle(BuildContext context) async {
    _mode = isDark(context) ? ThemeMode.light : ThemeMode.dark;
    notifyListeners();
    await (await SharedPreferences.getInstance()).setString(AppConstants.themeKey, _mode == ThemeMode.dark ? 'dark' : 'light');
  }
}
