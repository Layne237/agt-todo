import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../config/routes.dart';
import '../providers/theme_provider.dart';

/// Nav bar of the two mode screens (web .nav-bar): brand, Home, other mode, theme toggle.
class ModeAppBar extends StatelessWidget implements PreferredSizeWidget {
  const ModeAppBar({super.key, required this.icon, required this.title, required this.isClassic, this.onBrandTap});

  final String icon;
  final String title;
  final bool isClassic;

  /// The Programmable screen opens the dev menu after 5 taps on the brand.
  final VoidCallback? onBrandTap;

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    final theme = context.watch<ThemeProvider>();
    return AppBar(
      automaticallyImplyLeading: false,
      title: GestureDetector(
        onTap: onBrandTap,
        behavior: HitTestBehavior.opaque,
        child: Text('$icon $title', overflow: TextOverflow.ellipsis),
      ),
      actions: [
        IconButton(
          tooltip: 'common.home'.tr(),
          icon: const Text('🏠', style: TextStyle(fontSize: 20)),
          onPressed: () => context.go(AppRoutes.home),
        ),
        IconButton(
          tooltip: isClassic ? 'common.programmableMode'.tr() : 'common.classicMode'.tr(),
          icon: Text(isClassic ? '⏰' : '📝', style: const TextStyle(fontSize: 20)),
          onPressed: () => context.go(isClassic ? AppRoutes.programmable : AppRoutes.classic),
        ),
        IconButton(
          tooltip: 'common.toggleTheme'.tr(),
          icon: Text(theme.isDark(context) ? '☀️' : '🌙', style: const TextStyle(fontSize: 20)),
          onPressed: () => theme.toggle(context),
        ),
        const SizedBox(width: 4),
      ],
    );
  }
}
