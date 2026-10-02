import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'config/routes.dart';
import 'providers/classic_todo_provider.dart';
import 'providers/language_provider.dart';
import 'providers/programmable_todo_provider.dart';
import 'providers/theme_provider.dart';
import 'services/alarm_service.dart';
import 'services/notification_service.dart';
import 'services/storage_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await EasyLocalization.ensureInitialized();

  final alarms = AlarmService.instance;
  final notifications = NotificationService.instance;
  alarms.showAlarmScreen = openAlarmScreen;

  await notifications.init(onResponse: alarms.handleNotificationResponse);

  final theme = ThemeProvider();
  final classic = ClassicTodoProvider();
  final programmable = ProgrammableTodoProvider();
  final startLocale = await LanguageProvider.initialLocale();
  await Future.wait([theme.load(), classic.load(), programmable.load()]);

  // Re-create every OS alarm from the database: covers app updates, restored
  // backups, and permission changes since the last run.
  await notifications.rescheduleAll(programmable.allTasks);
  final launch = await notifications.launchResponse();

  runApp(
    EasyLocalization(
      supportedLocales: LanguageProvider.supportedLocales,
      path: 'assets/translations',
      fallbackLocale: const Locale('en'),
      startLocale: startLocale,
      saveLocale: false, // LanguageProvider persists it under the web app's key
      child: MultiProvider(
        providers: [
          ChangeNotifierProvider.value(value: theme),
          ChangeNotifierProvider(create: (_) => LanguageProvider()),
          ChangeNotifierProvider.value(value: classic),
          ChangeNotifierProvider.value(value: programmable),
          ChangeNotifierProvider.value(value: alarms),
        ],
        child: const AgtTodoApp(),
      ),
    ),
  );

  WidgetsBinding.instance.addPostFrameCallback((_) async {
    // Opened by tapping an alarm notification (or by a full-screen alarm): ring it.
    if (launch != null) {
      if (launch.actionId == null || launch.actionId!.isEmpty) appRouter.go(AppRoutes.programmable);
      await alarms.handleNotificationResponse(launch);
    }
    await alarms.start();
    await StorageService.instance.log('App', 'started${launch != null ? ' from notification' : ''}');
  });
}
