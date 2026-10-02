import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../screens/alarm_screen.dart';
import '../screens/classic_todo_screen.dart';
import '../screens/home_screen.dart';
import '../screens/programmable_todo_screen.dart';

class AppRoutes {
  AppRoutes._();
  static const home = '/';
  static const classic = '/classic';
  static const programmable = '/programmable';
  static const alarm = '/alarm';
}

/// Lets services (alarms fired from notifications) navigate without a BuildContext.
final rootNavigatorKey = GlobalKey<NavigatorState>();

final appRouter = GoRouter(
  navigatorKey: rootNavigatorKey,
  initialLocation: AppRoutes.home,
  routes: [
    GoRoute(
      path: AppRoutes.home,
      builder: (context, state) => const HomeScreen(),
      routes: [
        GoRoute(path: 'classic', builder: (context, state) => const ClassicTodoScreen()),
        GoRoute(path: 'programmable', builder: (context, state) => const ProgrammableTodoScreen()),
      ],
    ),
    GoRoute(
      path: AppRoutes.alarm,
      pageBuilder: (context, state) => const MaterialPage(fullscreenDialog: true, child: AlarmScreen()),
    ),
  ],
);

/// Opens the alarm screen on top of whatever is showing (once).
void openAlarmScreen() {
  final current = appRouter.routerDelegate.currentConfiguration.uri.path;
  if (current != AppRoutes.alarm) appRouter.push(AppRoutes.alarm);
}
