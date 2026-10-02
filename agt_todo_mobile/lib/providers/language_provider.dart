import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config/constants.dart';

/// EN/FR language, saved under the same key as the web app ('app_language').
/// easy_localization does the translating; this class owns persistence.
class LanguageProvider extends ChangeNotifier {
  static const supportedLocales = [Locale('en'), Locale('fr')];

  /// Locale to start with: the saved one, otherwise the device language if it's French, otherwise English.
  static Future<Locale> initialLocale() async {
    final saved = (await SharedPreferences.getInstance()).getString(AppConstants.languageKey);
    if (saved == 'fr' || saved == 'en') return Locale(saved!);
    final device = WidgetsBinding.instance.platformDispatcher.locale.languageCode;
    return Locale(device == 'fr' ? 'fr' : 'en');
  }

  bool isFrench(BuildContext context) => context.locale.languageCode == 'fr';

  Future<void> setLanguage(BuildContext context, String code) async {
    if (code != 'en' && code != 'fr') return;
    await context.setLocale(Locale(code));
    await (await SharedPreferences.getInstance()).setString(AppConstants.languageKey, code);
    notifyListeners();
  }
}
